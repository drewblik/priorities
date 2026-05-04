import { redirect } from 'next/navigation';

// M6 consolidated edit into the detail page at /priorities/[id]; this redirect
// preserves any in-flight links from M5's kebab menu or bookmarks.
export default async function LegacyEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/priorities/${id}`);
}
