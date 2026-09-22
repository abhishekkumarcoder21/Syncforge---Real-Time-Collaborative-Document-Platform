import { Editor } from "@/components/Editor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params;
  return <Editor documentId={id} />;
}
