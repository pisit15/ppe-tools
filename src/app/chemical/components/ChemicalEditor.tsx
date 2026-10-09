'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import type { ChemStorageArea, ChemSubstance } from '@/lib/types';
import SubstanceForm from './SubstanceForm';
import { Toast } from './ui';

export default function ChemicalEditor({ id }: { id?: string }) {
  const { companyId, companyName, canWrite, q, user } = useCompanyScope();
  const router = useRouter();
  const [scope] = useState({ companyId, companyName, q });
  const [retry, setRetry] = useState(0);
  const areas = useChemicalData<{data: ChemStorageArea[]}>(`/api/chemical/storage-areas${scope.q}`, retry);
  const substance = useChemicalData<{data: ChemSubstance}>(id ? `/api/chemical/substances/${id}` : '/api/chemical/settings' + scope.q, retry);
  const [toast, setToast] = useState<{type: 'success' | 'error'; msg: string} | null>(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer); }, [toast]);
  const back = () => router.push('/chemical' + scope.q);
  if (!canWrite || companyId !== scope.companyId) return <div role="alert" className="p-6 bg-amber-50">บริษัทเปลี่ยนไปหรือยังไม่ได้เลือกบริษัท — ปิดหน้านี้แล้วเปิดฟอร์มใหม่เพื่อป้องกันการบันทึกผิดบริษัท <button className="underline" onClick={back}>กลับทะเบียน</button></div>;
  if (areas.loading || substance.loading) return <p role="status">กำลังโหลดฟอร์มของบริษัท {scope.companyName}…</p>;
  if (areas.error || substance.error) return <p role="alert">{areas.error || substance.error} <button onClick={() => setRetry(v => v + 1)}>ลองใหม่</button> <button onClick={back}>กลับทะเบียน</button></p>;
  const initial = id ? substance.data?.data : null;
  if (id && (!initial || initial.company_id !== scope.companyId)) return <p role="alert">รายการนี้ไม่อยู่ในบริษัทที่เลือก <button onClick={back}>กลับทะเบียน</button></p>;
  return <><SubstanceForm companyId={scope.companyId} companyName={scope.companyName} areas={areas.data?.data || []} initial={initial || null} createdBy={user?.username || ''} onClose={back} onSaved={back} onToast={setToast} /><Toast toast={toast} /></>;
}
