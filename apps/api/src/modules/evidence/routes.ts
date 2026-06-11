import { basename } from "node:path";
import {
  createManualEvidenceSchema,
  listEvidenceQuerySchema,
  updateEvidenceSchema,
  uploadEvidenceMetadataSchema,
} from "@evidara/contracts";
import multipart from "@fastify/multipart";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { config } from "../../config.js";
import { auditContextFrom } from "../../lib/audit.js";
import { requireAuthContext } from "../../plugins/authentication.js";
import {
  authorizeEvidenceCreate,
  createEvidenceDownload,
  createManualEvidence,
  findExistingByIdempotencyKey,
  getEvidence,
  ingestFileEvidence,
  listEvidence,
  updateEvidence,
} from "./service.js";

const caseParamsSchema = z.object({ caseId: z.string().uuid() });
const evidenceParamsSchema = caseParamsSchema.extend({
  evidenceId: z.string().uuid(),
});
const idempotencyHeaderSchema = z.object({
  "idempotency-key": z.string().min(8).max(200),
});

function sendNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: "NOT_FOUND", message: "Evidence or case not found." },
  });
}

function sendForbidden(reply: FastifyReply, message: string) {
  return reply.status(403).send({
    error: { code: "FORBIDDEN", message },
  });
}

// Strips any client-supplied path components and keeps the name displayable.
function sanitizeFilename(raw: string): string {
  const name = basename(raw.replaceAll("\\", "/")).trim();
  return name.slice(0, 255);
}

export const registerEvidenceRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize: config.UPLOAD_MAX_BYTES,
      files: 1,
      fields: 20,
      fieldSize: 32 * 1024,
    },
  });

  app.get(
    "/cases/:caseId/evidence",
    {
      schema: {
        params: caseParamsSchema,
        querystring: listEvidenceQuerySchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await listEvidence(
        authContext,
        request.params.caseId,
        request.query,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to read evidence in this case.",
          );
        case "invalid_cursor":
          return reply.status(400).send({
            error: {
              code: "INVALID_CURSOR",
              message: "The cursor is not valid.",
            },
          });
        case "ok":
          return { data: result.data, nextCursor: result.nextCursor };
      }
    },
  );

  app.post(
    "/cases/:caseId/evidence/manual",
    {
      schema: {
        params: caseParamsSchema,
        headers: idempotencyHeaderSchema,
        body: createManualEvidenceSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await createManualEvidence(
        authContext,
        request.params.caseId,
        request.body,
        request.headers["idempotency-key"],
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to add evidence to this case.",
          );
        default:
          return reply
            .status(result.outcome === "created" ? 201 : 200)
            .send({ data: result.evidence });
      }
    },
  );

  app.post(
    "/cases/:caseId/evidence/files",
    {
      schema: {
        params: caseParamsSchema,
        headers: idempotencyHeaderSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const caseId = request.params.caseId;
      const idempotencyKey = request.headers["idempotency-key"];

      if (!request.isMultipart()) {
        return reply.status(400).send({
          error: {
            code: "MULTIPART_REQUIRED",
            message: "Send the file as multipart/form-data.",
          },
        });
      }

      // Permissions and idempotency are settled before any bytes are read.
      const access = await authorizeEvidenceCreate(
        authContext,
        caseId,
        auditContextFrom(request),
      );
      if (access.outcome === "not_found") return sendNotFound(reply);
      if (access.outcome === "forbidden") {
        return sendForbidden(
          reply,
          "You are not allowed to add evidence to this case.",
        );
      }

      const replayed = await findExistingByIdempotencyKey(
        caseId,
        idempotencyKey,
      );
      if (replayed) return reply.status(200).send({ data: replayed });

      const fields: Record<string, string> = {};
      for await (const part of request.parts()) {
        if (part.type === "field") {
          if (typeof part.value === "string")
            fields[part.fieldname] = part.value;
          continue;
        }

        // Metadata fields must precede the file part so they can be
        // validated before the stream is accepted.
        const metadata = uploadEvidenceMetadataSchema.safeParse(fields);
        if (!metadata.success) {
          part.file.resume();
          return reply.status(400).send({
            error: {
              code: "INVALID_METADATA",
              message: metadata.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; "),
            },
          });
        }

        const filename = sanitizeFilename(part.filename ?? "");
        if (!filename) {
          part.file.resume();
          return reply.status(400).send({
            error: {
              code: "FILENAME_REQUIRED",
              message: "The file part must include a filename.",
            },
          });
        }

        const result = await ingestFileEvidence(
          authContext,
          access.context,
          {
            stream: part.file,
            declaredFilename: filename,
            declaredMediaType: part.mimetype,
            wasTruncated: () => part.file.truncated,
            metadata: metadata.data,
          },
          idempotencyKey,
          auditContextFrom(request),
        );

        switch (result.outcome) {
          case "too_large":
            return reply.status(413).send({
              error: {
                code: "FILE_TOO_LARGE",
                message: `Files are limited to ${config.UPLOAD_MAX_BYTES} bytes.`,
              },
            });
          case "empty_file":
            return reply.status(400).send({
              error: {
                code: "EMPTY_FILE",
                message: "The uploaded file contains no bytes.",
              },
            });
          case "unsupported_type":
            return reply.status(415).send({
              error: {
                code: "UNSUPPORTED_MEDIA_TYPE",
                message: `Detected content type "${result.mediaType}" is not allowed.`,
              },
            });
          case "timeout":
            return reply.status(408).send({
              error: {
                code: "UPLOAD_TIMEOUT",
                message: "The upload did not complete within the allowed time.",
              },
            });
          default:
            return reply
              .status(result.outcome === "created" ? 201 : 200)
              .send({ data: result.evidence });
        }
      }

      return reply.status(400).send({
        error: {
          code: "FILE_REQUIRED",
          message: "Include exactly one file part in the request.",
        },
      });
    },
  );

  app.get(
    "/cases/:caseId/evidence/:evidenceId",
    { schema: { params: evidenceParamsSchema } },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await getEvidence(
        authContext,
        request.params.caseId,
        request.params.evidenceId,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to read evidence in this case.",
          );
        case "ok":
          return { data: result.evidence };
      }
    },
  );

  app.patch(
    "/cases/:caseId/evidence/:evidenceId",
    {
      schema: {
        params: evidenceParamsSchema,
        headers: z.object({
          "if-match": z.coerce.number().int().positive(),
        }),
        body: updateEvidenceSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await updateEvidence(
        authContext,
        request.params.caseId,
        request.params.evidenceId,
        request.body,
        request.headers["if-match"],
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to update evidence in this case.",
          );
        case "version_conflict":
          return reply.status(412).send({
            error: {
              code: "VERSION_CONFLICT",
              message:
                "The evidence changed since you loaded it. Reload and retry.",
              currentVersion: result.currentVersion,
            },
          });
        case "updated":
          return { data: result.evidence };
      }
    },
  );

  app.get(
    "/cases/:caseId/evidence/:evidenceId/download",
    { schema: { params: evidenceParamsSchema } },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await createEvidenceDownload(
        authContext,
        request.params.caseId,
        request.params.evidenceId,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to download evidence in this case.",
          );
        case "no_content":
          return reply.status(409).send({
            error: {
              code: "NO_BINARY_CONTENT",
              message: "This evidence item has no downloadable file.",
            },
          });
        case "ok":
          return { data: result.download };
      }
    },
  );
};
