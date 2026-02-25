import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CurrencyDisplay } from "../common/CurrencyDisplay";
import { BudgetVendorRow } from "./BudgetVendorRow";
import type { CategoryBudget } from "../../hooks/useBudget";

export function BudgetCategoryRow({
  data,
  currency,
}: {
  data: CategoryBudget;
  currency: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors"
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2 font-medium text-white">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
            {data.category.name}
            <span className="text-xs text-gray-500 font-normal">
              ({data.entries.length})
            </span>
          </div>
        </td>
        <td className="py-3 px-4 text-right">
          <CurrencyDisplay amount={data.totalHigh || null} currency={currency} className="font-medium" />
        </td>
        <td className="py-3 px-4 text-right">
          <CurrencyDisplay amount={data.totalLow || null} currency={currency} className="font-medium" />
        </td>
        <td className="py-3 px-4 text-right">
          <CurrencyDisplay amount={data.totalEstimatedActual || null} currency={currency} className="font-medium" />
        </td>
        <td className="py-3 px-4 text-right">
          <CurrencyDisplay amount={data.totalPaid || null} currency={currency} className="font-medium" />
        </td>
        <td className="py-3 px-4 text-right">
          <CurrencyDisplay amount={data.totalBalanceDue || null} currency={currency} className="font-medium" />
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <td colSpan={6} className="p-0">
              <table className="w-full">
                <tbody>
                  {data.entries.map((entry) => (
                    <BudgetVendorRow key={entry.id} entry={entry} currency={currency} />
                  ))}
                </tbody>
              </table>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}
