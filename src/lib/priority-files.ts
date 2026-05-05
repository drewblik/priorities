import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { priorities, priorityFiles, type PriorityFile } from '@/db/schema';
import { newId } from '@/lib/id';
import { verifyPriorityOwnership } from '@/lib/priority-ownership';

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function getFilesForPriority(
  userId: string,
  priorityId: string,
): Promise<PriorityFile[]> {
  return db
    .select({
      id: priorityFiles.id,
      priorityId: priorityFiles.priorityId,
      filename: priorityFiles.filename,
      blobUrl: priorityFiles.blobUrl,
      mimeType: priorityFiles.mimeType,
      sizeBytes: priorityFiles.sizeBytes,
      uploadedAt: priorityFiles.uploadedAt,
      deletedAt: priorityFiles.deletedAt,
    })
    .from(priorityFiles)
    .innerJoin(priorities, eq(priorityFiles.priorityId, priorities.id))
    .where(
      and(
        eq(priorityFiles.priorityId, priorityId),
        eq(priorities.userId, userId),
        isNull(priorityFiles.deletedAt),
        isNull(priorities.deletedAt),
      ),
    )
    .orderBy(desc(priorityFiles.uploadedAt));
}

export type CreateFileInput = {
  filename: string;
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
};

export async function createFileRecord(
  userId: string,
  priorityId: string,
  input: CreateFileInput,
): Promise<PriorityFile | null> {
  const ok = await verifyPriorityOwnership(userId, priorityId);
  if (!ok) return null;

  const [row] = await db
    .insert(priorityFiles)
    .values({
      id: newId('file'),
      priorityId,
      filename: input.filename,
      blobUrl: input.blobUrl,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    })
    .returning();
  return row ?? null;
}

export async function softDeleteFileRecord(
  userId: string,
  priorityId: string,
  fileId: string,
): Promise<boolean> {
  const ok = await verifyPriorityOwnership(userId, priorityId);
  if (!ok) return false;

  // Note: only soft-deletes the row; the blob in Vercel storage is left
  // orphaned. Actual blob cleanup is deferred to a v1.1 background sweep
  // (priorities-tdd.md:472-512).
  const result = await db
    .update(priorityFiles)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(priorityFiles.id, fileId),
        eq(priorityFiles.priorityId, priorityId),
        isNull(priorityFiles.deletedAt),
      ),
    )
    .returning({ id: priorityFiles.id });
  return result.length > 0;
}
