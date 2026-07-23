# EPIC: Economy & Trading Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Issue:** `772d0e5`
**Type:** Feature Epic
**Tags:** economy, trading, currency, market, auction, banking

## Overview

Economy and trading mechanics — currency systems, market dynamics, trading, auction house, banking, and economic simulation. Supports both NPC and player-driven economies.

## Currency System

### Currency Types

| Type                 | Value    | Use                |
| -------------------- | -------- | ------------------ |
| **Copper**           | 1        | Common purchases   |
| **Silver**           | 10       | Standard trade     |
| **Gold**             | 100      | Major purchases    |
| **Platinum**         | 1000     | Luxury items       |
| **Gems**             | Variable | High-value storage |
| **Faction Currency** | Variable | Faction-specific   |
| **Premium**          | Variable | Special purchases  |

### Currency Structure

```typescript
interface Currency {
  id: string;
  name: string;
  symbol: string;
  value: number; // relative to base currency
  type: "standard" | "faction" | "premium" | "special";
  exchange_rate: ExchangeRate;
  inflation_rate: number;
  max_supply: number;
  current_supply: number;
}

interface ExchangeRate {
  from_currency: string;
  to_currency: string;
  rate: number;
  volatility: number; // 0-100
  last_updated: Date;
}
```

## Market System

### Market Structure

```typescript
interface Market {
  id: string;
  name: string;
  location: WorldLocation;
  type: "general" | "specialized" | "black_market" | "auction" | "player";
  vendors: Vendor[];
  inventory: MarketItem[];
  prices: PriceHistory[];
  supply_demand: SupplyDemand;
  tax_rate: number;
  reputation_required: number;
}

interface Vendor {
  id: string;
  name: string;
  specialty: ItemCategory[];
  inventory: VendorItem[];
  gold: number;
  restock_time: number;
  reputation: VendorReputation;
  discounts: VendorDiscount[];
}

interface MarketItem {
  item_id: string;
  quantity: number;
  base_price: number;
  current_price: number;
  supply: number; // 0-100
  demand: number; // 0-100
  trend: "rising" | "falling" | "stable";
}
```

### Price Dynamics

```typescript
interface PriceSystem {
  base_price: number;
  modifiers: PriceModifier[];
  current_price: number;
  price_history: PricePoint[];
  volatility: number;
  trend: PriceTrend;
}

interface PriceModifier {
  type: "supply" | "demand" | "event" | "season" | "reputation" | "tax" | "discount";
  value: number; // percentage
  duration: number; // in minutes
  source: string;
}

interface PricePoint {
  timestamp: Date;
  price: number;
  volume: number; // items traded
}
```

### Supply & Demand

```typescript
interface SupplyDemand {
  item_id: string;
  supply: number; // 0-100
  demand: number; // 0-100
  equilibrium_price: number;
  elasticity: number; // price sensitivity
  factors: SupplyDemandFactor[];
}

interface SupplyDemandFactor {
  type: "production" | "consumption" | "import" | "export" | "event" | "season";
  impact: number; // -100 to 100
  duration: number;
  source: string;
}
```

## Trading System

### Player Trading

```typescript
interface PlayerTrade {
  id: string;
  initiator: Character;
  recipient: Character;
  initiator_items: TradeItem[];
  recipient_items: TradeItem[];
  initiator_gold: number;
  recipient_gold: number;
  status: "pending" | "accepted" | "rejected" | "completed" | "cancelled";
  timestamp: Date;
  location: WorldLocation;
}

interface TradeItem {
  item: Item;
  quantity: number;
  value: number;
  inspected: boolean;
}
```

### Trade Mechanics

```typescript
interface TradeNegotiation {
  trade: PlayerTrade;
  offers: TradeOffer[];
  counter_offers: TradeOffer[];
  final_offer: TradeOffer;
  trust_score: number; // 0-100
  reputation_change: number;
}

interface TradeOffer {
  from: string;
  items: TradeItem[];
  gold: number;
  conditions: TradeCondition[];
  timestamp: Date;
}
```

## Auction House

### Auction System

```typescript
interface Auction {
  id: string;
  seller: Character;
  item: Item;
  quantity: number;
  starting_bid: number;
  current_bid: number;
  buyout_price?: number;
  bidders: Bid[];
  start_time: Date;
  end_time: Date;
  status: "active" | "sold" | "expired" | "cancelled";
  category: ItemCategory;
  fees: AuctionFees;
}

interface Bid {
  bidder: Character;
  amount: number;
  timestamp: Date;
  is_winning: boolean;
}

interface AuctionFees {
  listing_fee: number; // percentage
  selling_fee: number; // percentage
  total_fees: number;
}
```

### Auction Features

| Feature              | Description                   |
| -------------------- | ----------------------------- |
| **Bidding**          | Place bids on items           |
| **Buyout**           | Instant purchase at set price |
| **Snipe Protection** | Extension on last-second bids |
| **Categories**       | Item filtering                |
| **Search**           | Text/attribute search         |
| **Watchlist**        | Track interesting auctions    |
| **History**          | Price history for items       |

## Banking System

### Bank Structure

```typescript
interface Bank {
  id: string;
  name: string;
  location: WorldLocation;
  type: "national" | "faction" | "player" | "guild";
  accounts: BankAccount[];
  services: BankService[];
  interest_rate: number;
  loan_rate: number;
  security_level: number;
}

interface BankAccount {
  id: string;
  owner_id: string;
  type: "checking" | "savings" | "guild" | "investment";
  balance: number;
  currency: Currency;
  transactions: Transaction[];
  interest_rate: number;
  overdraft_limit: number;
}

interface Transaction {
  id: string;
  type: "deposit" | "withdrawal" | "transfer" | "interest" | "fee" | "loan";
  amount: number;
  from_account?: string;
  to_account?: string;
  timestamp: Date;
  description: string;
}
```

### Banking Services

| Service          | Description          | Fee            |
| ---------------- | -------------------- | -------------- |
| **Storage**      | Secure item storage  | 1-5%           |
| **Transfer**     | Send money to others | 0.5-2%         |
| **Loan**         | Borrow money         | 5-15% interest |
| **Investment**   | Earn interest        | 1-5% return    |
| **Exchange**     | Currency conversion  | 1-3%           |
| **Safe Deposit** | Secure item vault    | Fixed fee      |

## Economic Simulation

### Economic Indicators

```typescript
interface EconomicState {
  inflation_rate: number;
  unemployment: number;
  trade_volume: number;
  gold_supply: number;
  price_index: number;
  market_confidence: number; // 0-100
  economic_cycle: "recession" | "recovery" | "growth" | "peak";
}

interface EconomicEvent {
  id: string;
  type: "boom" | "bust" | "war" | "discovery" | "plague" | "harvest" | "drought";
  impact: EconomicImpact;
  duration: number; // in game days
  affected_regions: string[];
  affected_items: ItemCategory[];
}

interface EconomicImpact {
  price_change: number; // percentage
  supply_change: number;
  demand_change: number;
  confidence_change: number;
}
```

### Market Manipulation

```typescript
interface MarketManipulation {
  type: "monopoly" | "price_fixing" | "hoarding" | "smuggling" | "counterfeiting";
  target: Market | ItemCategory;
  manipulator: Character;
  success_chance: number;
  risk: ManipulationRisk;
  rewards: ManipulationReward;
}
```

## Guild Economy

### Guild Banking

```typescript
interface GuildBank {
  guild_id: string;
  accounts: GuildAccount[];
  permissions: GuildBankPermission[];
  audit_log: GuildTransaction[];
  taxes: GuildTax[];
  investments: GuildInvestment[];
}

interface GuildAccount {
  id: string;
  name: string;
  type: "general" | "raid" | "crafting" | "events";
  balance: number;
  permissions: AccountPermission[];
}
```

### Guild Taxes

```typescript
interface GuildTax {
  id: string;
  name: string;
  type: "income" | "trade" | "raid_loot" | "crafting" | "donation";
  rate: number; // percentage
  collection_method: "automatic" | "manual";
  revenue: number;
  exemptions: TaxExemption[];
}
```

## Integration Points

- **RPG Mechanics** — CHA for barter, INT for trading
- **Inventory System** — Item management
- **World & Locations** — Markets, banks, auction houses
- **Faction System** — Faction currency, reputation
- **Crafting System** — Crafted item sales
- **Guild System** — Guild banking, taxes
- **Quest System** — Trading objectives

## Open Questions

- Should economy be player-driven or NPC-controlled?
- How to prevent inflation/deflation?
- Should there be a global or regional economy?
- How to handle real-money trading (RMT)?
- Should economy affect gameplay difficulty?

## Files

- `src/rpg/economy/` — economy system
- `src/rpg/economy/currency.ts` — currency system
- `src/rpg/economy/market.ts` — market system
- `src/rpg/economy/trading.ts` — player trading
- `src/rpg/economy/auction.ts` — auction house
- `src/rpg/economy/banking.ts` — banking system
- `src/rpg/economy/simulation.ts` — economic simulation
- `src/rpg/economy/guild.ts` — guild economy
- `src/db/schema-economy.ts` — economy tables
- `src/routes/economy.ts` — economy API

## Related Epics

- **Epic RPG Mechanics** — Stats, skills
- **Epic Inventory System** — Item management
- **Epic World & Locations** — Markets, banks
- **Epic Faction System** — Faction currency
- **Epic Crafting System** — Item sales
- **Epic Guild System** — Guild banking

## Linked Tasks

- TASK-economy-trading.md
