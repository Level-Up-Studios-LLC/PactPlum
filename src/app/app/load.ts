import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/errors";

/** Shows the 404 page when a tenant-scoped lookup finds nothing. */
export async function loadOrNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
