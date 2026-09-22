import { ReactNode } from 'react';

interface ReportPageProps {
  children: ReactNode;
  loading?: boolean;
}

export default function ReportPage({ children, loading }: ReportPageProps) {
  return (
    <div className="report-screen-bg min-h-screen bg-gray-200 py-6">
      <div className="no-print sticky top-0 z-10 flex justify-center gap-3 mb-6">
        <button onClick={() => window.print()} className="btn-primary text-sm shadow">
          طباعة
        </button>
        <button onClick={() => window.close()} className="btn-secondary text-sm shadow">
          إغلاق
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-10">جاري التحميل...</div>
      ) : (
        <div className="report-sheet report-font mx-auto bg-white" style={{ width: '21cm' }}>
          {children}
        </div>
      )}
    </div>
  );
}
