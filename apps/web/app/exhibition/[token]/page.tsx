import { ExhibitionVisitor } from "@/components/ExhibitionVisitor";
export default async function ExhibitionPage({params}:{params:Promise<{token:string}>}) { const {token}=await params; return <ExhibitionVisitor token={token}/>; }
