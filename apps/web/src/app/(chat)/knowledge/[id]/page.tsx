import { CollectionDetail } from "@/components/collections/collection-detail";

export default async function KnowledgeCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CollectionDetail id={id} />;
}
