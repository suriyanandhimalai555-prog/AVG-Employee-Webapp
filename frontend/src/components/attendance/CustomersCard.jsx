import { MessageCircle, ChevronRight } from 'lucide-react';

// Home-screen shortcut into the customer WhatsApp notification manager.
// A slim full-width row — matches the card column but reads as a quiet
// secondary action next to the larger Staff Management card.
export const CustomersCard = ({ onOpen }) => (
  <button
    onClick={onOpen}
    className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-border card-shadow tactile-press group hover:border-emerald/40 transition-all duration-200"
  >
    <span className="w-8 h-8 rounded-lg bg-emerald/10 flex items-center justify-center shrink-0">
      <MessageCircle size={15} className="text-emerald" aria-hidden="true" />
    </span>
    <span className="text-[13px] font-bold text-navy">Customers</span>
    <span className="ml-auto text-[10px] font-medium text-navy/40">WhatsApp opt-ins</span>
    <ChevronRight
      size={14}
      className="text-navy/25 group-hover:text-navy/50 group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
      aria-hidden="true"
    />
  </button>
);
