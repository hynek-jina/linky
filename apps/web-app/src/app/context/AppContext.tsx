/* eslint-disable react-refresh/only-export-components */
import React from "react";

export type AppState = object;
export type AppActions = object;

type AppContextValue = {
  state: AppState;
  actions: AppActions;
};

interface AppProviderProps {
  actions: AppActions;
  children: React.ReactNode;
  state: AppState;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export const AppProvider = ({
  actions,
  children,
  state,
}: AppProviderProps): React.ReactElement => {
  const value = React.useMemo(() => ({ state, actions }), [actions, state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = <
  TState extends AppState = AppState,
  TActions extends AppActions = AppActions,
>(): { state: TState; actions: TActions } => {
  const value = React.useContext(AppContext);
  if (!value) {
    throw new Error("useAppContext must be used within AppProvider");
  }

  return {
    state: value.state as TState,
    actions: value.actions as TActions,
  };
};

export const useAppState = <TState extends AppState = AppState>(): TState => {
  const { state } = useAppContext<TState, AppActions>();
  return state;
};

export const useAppActions = <
  TActions extends AppActions = AppActions,
>(): TActions => {
  const { actions } = useAppContext<AppState, TActions>();
  return actions;
};
