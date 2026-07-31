import {
  ArrowLeftRight,
  Bitcoin,
  CreditCard,
  LayoutDashboard,
  Tags,
  Wallet,
} from "lucide-react";

export const NAV = [
  {
    labelKey: "nav.overview",
    items: [
      { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "nav.money",
    items: [
      { labelKey: "nav.movements", href: "/movements", icon: ArrowLeftRight },
      { labelKey: "nav.accounts", href: "/accounts", icon: Wallet },
      { labelKey: "nav.categories", href: "/categories", icon: Tags },
      {
        labelKey: "nav.creditCards",
        href: "/credit-cards",
        icon: CreditCard,
      },
      { labelKey: "nav.crypto", href: "/crypto", icon: Bitcoin },
    ],
  },
] as const;
