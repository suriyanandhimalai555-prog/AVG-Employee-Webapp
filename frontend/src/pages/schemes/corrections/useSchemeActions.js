// frontend/src/pages/schemes/corrections/useSchemeActions.js
// One hook that gathers every correction mutation, keyed by scheme code, so the
// cards can call actions[schemeCode].correct / .void / .delete without knowing
// which scheme they are rendering.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import {
  useCorrectGoldMemberMutation,
  useVoidGoldMemberMutation,
  useDeleteGoldMemberMutation,
  useCorrectTradingMemberMutation,
  useVoidTradingMemberMutation,
  useDeleteTradingMemberMutation,
  useCorrectBuildersPlanMutation,
  useVoidBuildersPlanMutation,
  useDeleteBuildersPlanMutation,
  useChangeBuildersRewardMutation,
  useChooseBuildersRewardMutation,
  useCorrectChitMemberMutation,
  useVoidChitMemberMutation,
  useDeleteChitMemberMutation,
  useCorrectGoldCoinSlotMutation,
  useVoidGoldCoinSlotMutation,
  useDeleteGoldCoinSlotMutation,
  useUndoGoldCoinDrawMutation,
  useCorrectLssSlotMutation,
  useVoidLssSlotMutation,
  useDeleteLssSlotMutation,
  useUndoLssDrawMutation,
  useCorrectLandBookingMutation,
  useVoidLandBookingMutation,
  useDeleteLandBookingMutation,
} from '../../../store/api/apiSlice';

// ─── Scheme mutation hooks ────────────────────────────────────────────────────

export function useSchemeActions() {
  const [correctGold]      = useCorrectGoldMemberMutation();
  const [voidGold]         = useVoidGoldMemberMutation();
  const [deleteGold]       = useDeleteGoldMemberMutation();
  const [correctTrading]   = useCorrectTradingMemberMutation();
  const [voidTrading]      = useVoidTradingMemberMutation();
  const [deleteTrading]    = useDeleteTradingMemberMutation();
  const [correctBuilders]      = useCorrectBuildersPlanMutation();
  const [voidBuilders]         = useVoidBuildersPlanMutation();
  const [deleteBuilders]       = useDeleteBuildersPlanMutation();
  const [changeRewardBuilders] = useChangeBuildersRewardMutation();
  const [chooseRewardBuilders] = useChooseBuildersRewardMutation();
  const [correctChit]      = useCorrectChitMemberMutation();
  const [voidChit]         = useVoidChitMemberMutation();
  const [deleteChit]       = useDeleteChitMemberMutation();
  const [correctGC]        = useCorrectGoldCoinSlotMutation();
  const [voidGC]           = useVoidGoldCoinSlotMutation();
  const [deleteGC]         = useDeleteGoldCoinSlotMutation();
  const [undoGCDraw]       = useUndoGoldCoinDrawMutation();
  const [correctLss]       = useCorrectLssSlotMutation();
  const [voidLss]          = useVoidLssSlotMutation();
  const [deleteLss]        = useDeleteLssSlotMutation();
  const [undoLssDraw]      = useUndoLssDrawMutation();
  const [correctLand]      = useCorrectLandBookingMutation();
  const [voidLand]         = useVoidLandBookingMutation();
  const [deleteLand]       = useDeleteLandBookingMutation();

  return {
    gold_scheme:       { correct: correctGold,    void: voidGold,    delete: deleteGold,    entityKey: (e) => ({ id: e.id }) },
    trading_academy:   { correct: correctTrading, void: voidTrading, delete: deleteTrading, entityKey: (e) => ({ id: e.id }) },
    builders_scheme:   { correct: correctBuilders, void: voidBuilders, delete: deleteBuilders, changeReward: changeRewardBuilders, chooseReward: chooseRewardBuilders, entityKey: (e) => ({ planId: e.id }) },
    agila_chit_scheme: { correct: correctChit,    void: voidChit,    delete: deleteChit,    entityKey: (e) => ({ groupId: e.group_id, memberId: e.id }) },
    gold_coin_scheme:  { correct: correctGC,  void: voidGC,  delete: deleteGC,  undoDraw: undoGCDraw,  entityKey: (e) => ({ id: e.id }) },
    lss_scheme:        { correct: correctLss, void: voidLss, delete: deleteLss, undoDraw: undoLssDraw, entityKey: (e) => ({ id: e.id }) },
    land_scheme:       { correct: correctLand,    void: voidLand,    delete: deleteLand,    entityKey: (e) => ({ id: e.id }) },
  };
}
