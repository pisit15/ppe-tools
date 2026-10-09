import ChemicalEditor from '../../components/ChemicalEditor';
export default async function EditChemicalPage({ params }: { params: Promise<{id: string}> }) {
  return <ChemicalEditor id={(await params).id} />;
}