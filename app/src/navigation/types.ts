import type { NavigatorScreenParams } from '@react-navigation/native';

export type FridgesStackParamList = {
  Dashboard: undefined;
  FridgeDetail: { fridgeId: number; fridgeName: string };
};

export type InspectorStackParamList = {
  InspectorReport: { fridgeId?: number } | undefined;
};

export type RootTabParamList = {
  FridgesTab: NavigatorScreenParams<FridgesStackParamList>;
  UploadTab: undefined;
  InspectorTab: NavigatorScreenParams<InspectorStackParamList>;
};
