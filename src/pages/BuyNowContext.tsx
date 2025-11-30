import { createContext, useContext, useState } from "react";

const BuyNowContext = createContext<any>(null);

export function BuyNowProvider({ children }: any) {
  const [buyNowItem, setBuyNowItem] = useState(null);

  return (
    <BuyNowContext.Provider value={{ buyNowItem, setBuyNowItem }}>
      {children}
    </BuyNowContext.Provider>
  );
}

export function useBuyNow() {
  return useContext(BuyNowContext);
}