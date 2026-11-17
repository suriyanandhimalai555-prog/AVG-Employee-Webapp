// frontend/src/pages/schemes/corrections/entryRowRegistry.js
// Which summary-row component renders an entry of each scheme. Chit is absent on
// purpose: its entries are groups, rendered by ChitGroupCard.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import {
  EntryRowGold,
  EntryRowTrading,
  EntryRowBuilders,
  EntryRowGoldCoin,
  EntryRowLss,
  EntryRowLand,
} from './entryRows';

export const ENTRY_ROW = {
  gold_scheme: EntryRowGold, trading_academy: EntryRowTrading,
  builders_scheme: EntryRowBuilders,
  gold_coin_scheme: EntryRowGoldCoin, lss_scheme: EntryRowLss, land_scheme: EntryRowLand,
};
