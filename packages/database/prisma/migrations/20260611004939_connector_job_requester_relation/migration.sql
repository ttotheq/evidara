-- AddForeignKey
ALTER TABLE "ConnectorJob" ADD CONSTRAINT "ConnectorJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
