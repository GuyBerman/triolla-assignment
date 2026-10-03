import type { NavigatorScreenParams } from '@react-navigation/native';

export type FridgeDetailParams = { fridgeId: number; fridgeName: string };

export type FridgesStackParamList = {
  Dashboard: undefined;
  Branch: { branchName: string };
  FridgeDetail: FridgeDetailParams;
};

export type SearchStackParamList = {
  Search: undefined;
  FridgeDetail: FridgeDetailParams;
};

export type InspectorStackParamList = {
  InspectorReport: { fridgeId?: number } | undefined;
};

export type RootTabParamList = {
  FridgesTab: NavigatorScreenParams<FridgesStackParamList>;
  SearchTab: NavigatorScreenParams<SearchStackParamList>;
  UploadTab: undefined;
  RulesTab: undefined;
  InspectorTab: NavigatorScreenParams<InspectorStackParamList>;
};
