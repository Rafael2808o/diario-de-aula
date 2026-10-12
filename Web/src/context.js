import { createContext, useContext } from "react";

// Sessão, dados da conta e navegação compartilhados pelas páginas.
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
