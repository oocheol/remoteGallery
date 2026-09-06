import { GalleryEditor } from "@/components/GalleryEditor";
export default async function GalleryPage({ params }: { params: Promise<{id:string}> }) { const { id } = await params; return <GalleryEditor galleryId={id} />; }
