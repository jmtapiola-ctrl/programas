'use client'

import { Printer } from 'lucide-react'

export function PrintPlanButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="pe-vista-print-button inline-flex items-center gap-2 rounded-lg border border-[#9d9d95] bg-white px-4 py-2 text-[13px] font-medium text-[#292929] transition-colors hover:bg-[#f0f0eb]"
    >
      <Printer aria-hidden="true" className="h-4 w-4" />
      Exportar PDF
    </button>
  )
}
