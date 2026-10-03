import { createContext, useContext } from 'react';

export const WindowIdContext = createContext<string>('');
export const useWindowId = () => useContext(WindowIdContext);
