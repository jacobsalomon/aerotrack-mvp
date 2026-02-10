# 005: LLP Life Usage & Remaining Life Calculator

**Priority:** 9 (DEFERRED — not needed for HEICO demo, build later)
**Estimated effort:** Small-Medium
**Dependencies:** None (uses existing Component model)

---

## Overview

Add a remaining life calculator that shows how much usable life each life-limited part has left — in cycles, hours, and calendar time. This is a critical business metric: a component with 80% life remaining is worth dramatically more than one with 20% remaining. ProvenAir's core users (parts traders, lessors, fleet planners) need this to make million-dollar buying and selling decisions.

For the Parker/HEICO demo, this adds immediate business context to every component on screen. Parker executives think in terms of part value and fleet planning — showing remaining life connects AeroTrack's documentation features to dollars.

---

## What to Build

### 1. Database Changes

Add fields to the `Component` model:

```prisma
model Component {
  // ... existing fields ...

  // Life limit fields (some may already exist — check and add missing ones):
  lifeLimitHours    Float?    // Maximum hours before mandatory retirement
  lifeLimitCycles   Int?      // Maximum cycles before mandatory retirement
  lifeLimitCalendar Int?      // Calendar life limit in months (if applicable)
  overhaulsCompleted Int   @default(0)  // Number of overhauls completed
  maxOverhauls       Int?     // Maximum overhauls allowed (some parts have this limit)
  estimatedValueNew  Float?   // New replacement cost in USD (for value calculations)
}
```

Check which fields already exist in the schema before adding. Run `npx prisma db push` and `npx prisma generate`.

### 2. Life Calculator Service

Create `/lib/life-calculator.ts`:

```typescript
interface LifeStatus {
  // Cycle life
  cycleLife?: {
    total: number;        // lifeLimitCycles
    consumed: number;     // totalCycles
    remaining: number;    // total - consumed
    percentUsed: number;  // (consumed / total) * 100
    percentRemaining: number;
  };
  // Hour life
  hourLife?: {
    total: number;
    consumed: number;
    remaining: number;
    percentUsed: number;
    percentRemaining: number;
  };
  // Calendar life
  calendarLife?: {
    totalMonths: number;
    elapsedMonths: number;
    remainingMonths: number;
    percentUsed: number;
    percentRemaining: number;
    expiryDate: Date;
  };
  // Overhaul life
  overhaulLife?: {
    maxOverhauls: number;
    completed: number;
    remaining: number;
  };
  // Value estimate
  estimatedValue?: {
    newCost: number;
    currentValue: number;       // Linear depreciation based on life consumed
    methodology: string;        // "Linear depreciation based on cycle life consumed"
  };
  // Time to limit
  timeToLimit?: {
    estimatedDate: Date | null;       // When life limit will be reached at current usage rate
    avgCyclesPerMonth: number | null;  // Calculated from recent event data
    avgHoursPerMonth: number | null;
    confidence: "high" | "medium" | "low";
  };
  // Overall status
  overallStatus: "green" | "yellow" | "orange" | "red";
  // green: >50% remaining across all limits
  // yellow: 25-50% remaining on any limit
  // orange: 10-25% remaining on any limit
  // red: <10% remaining on any limit
  alertMessage?: string;  // e.g., "Approaching cycle life limit — 8% remaining"
}

export function calculateLifeStatus(component: ComponentWithEvents): LifeStatus { ... }
```

**Time-to-limit calculation:**
- Look at the last 3-5 events with cycle/hour data
- Calculate average cycles/hours per month between them
- Project forward: remaining / avgPerMonth = months until limit
- Confidence: high if >5 data points, medium if 3-5, low if <3

**Value estimate:**
- Simple linear depreciation: `newCost × (percentRemaining / 100)`
- This is a rough estimate — real valuation is more complex, but this is good enough for a demo

### 3. Update Seed Data

Add life limit data and estimated new costs to seed components:

| Component | P/N | Life Limit (Cycles) | Life Limit (Hours) | Calendar Limit | New Cost | Current Cycles | Status |
|---|---|---|---|---|---|---|---|
| 1: Perfect History | 881700-1001 | 30,000 | 40,000 | 20 years | $85,000 | 12,847 cycles | ~57% remaining |
| 2: The Gap | 881700-1034 | 30,000 | 40,000 | 20 years | $85,000 | 9,200 cycles | ~69% remaining |
| 3: Tribal Knowledge | 2548934-1 | 20,000 | 30,000 | 15 years | $42,000 | 16,500 cycles | ~18% remaining |
| 4: NFF Actuator | 65075-05 | 25,000 | 35,000 | 15 years | $28,000 | 7,800 cycles | ~69% remaining |
| 6: In Repair | 881700-1089 | 30,000 | 40,000 | 20 years | $85,000 | 8,102 cycles | ~73% remaining |
| 7: Retired | 2670112-M1 | 50,000 (hours) | 50,000 | 25 years | $120,000 | 48,200 hours | Retired (exceeded) |
| 8: Just Born | 881700-2001 | 30,000 | 40,000 | 20 years | $85,000 | 0 cycles | 100% remaining |

Component 3 (fuel control valve) should be close to its life limit to create an interesting demo moment — "This valve has 18% cycle life remaining. At current usage, it hits its limit in March 2027."

Re-run seed: `npx prisma db push --force-reset && npx prisma db seed`

### 4. API Route

```
GET /api/components/[id]/life-status
  - Calls calculateLifeStatus() for the component
  - Returns the full LifeStatus object
```

### 5. Frontend: Life Status Panel on Part Detail Page

Add a "Life Status" section on the Part Detail page, positioned prominently (near the top, after the component header):

```
┌─────────────────────────────────────────────────────────────────┐
│ Life Status                                            🟢 Good  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Cycle Life:                                                       │
│ [████████████████░░░░░░░░░░░░░░] 57% used                       │
│ 12,847 of 30,000 cycles | 17,153 remaining                      │
│                                                                   │
│ Hour Life:                                                        │
│ [████████████░░░░░░░░░░░░░░░░░░] 42% used                       │
│ 16,800 of 40,000 hours | 23,200 remaining                       │
│                                                                   │
│ Calendar Life:                                                    │
│ [█████████░░░░░░░░░░░░░░░░░░░░░] 34% used                       │
│ Manufactured: Mar 2019 | Limit: Mar 2039 | 13 years remaining   │
│                                                                   │
│ ─────────────────────────────────────────────────────────────── │
│ Estimated Remaining Value: $48,200                               │
│ (Based on $85,000 new cost, linear depreciation on cycle life)   │
│                                                                   │
│ At current usage rate (~2,100 cycles/year):                      │
│ Cycle limit reached: ~April 2034                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Visual details:**
- Progress bars filled with color matching status (green/yellow/orange/red)
- The most limiting factor (whichever life limit is closest to expiry) should be highlighted
- If any limit is <10% remaining, show a red alert banner: "⚠ Approaching life limit"

### 6. Frontend: Life Status Column on Dashboard

On the main Dashboard parts table, add a "Life" column showing:
- A mini progress bar or percentage for the most limiting life factor
- Color-coded: 🟢 >50%, 🟡 25-50%, 🟠 10-25%, 🔴 <10%
- Clicking the cell navigates to the Part Detail page

### 7. Life Limit Alerts

Components within 10% of any life limit should generate an Alert (using the existing `Alert` model):
- alertType: "life_limit_approaching"
- severity: "warning" if 10-25% remaining, "critical" if <10%
- title: "[P/N] approaching cycle life limit"
- description: "881700-1001 has 8% cycle life remaining (2,400 of 30,000 cycles). At current usage rate, limit will be reached approximately March 2027."

Generate these alerts when calculating life status. They should appear on the dashboard's alerts section.

---

## Acceptance Criteria

- [ ] Life limit fields added to Component model (lifeLimitCycles, lifeLimitHours, lifeLimitCalendar, estimatedValueNew)
- [ ] Seed data updated with realistic life limits and new costs for all components
- [ ] Life calculator correctly computes remaining life for cycles, hours, and calendar
- [ ] Estimated remaining value calculates using linear depreciation
- [ ] Time-to-limit projection calculates from recent usage data
- [ ] Part Detail page shows Life Status panel with progress bars for each limit type
- [ ] Progress bars are color-coded (green >50%, yellow 25-50%, orange 10-25%, red <10%)
- [ ] Estimated remaining value and time-to-limit are displayed
- [ ] Dashboard parts table shows a Life column with mini progress bar or percentage
- [ ] Components within 10% of a life limit generate alerts
- [ ] Component 3 (fuel control valve) shows an orange/red status (close to cycle limit)
- [ ] Component 8 (just born) shows 100% remaining (all green)
- [ ] Component 7 (retired) shows an appropriate "exceeded" or "retired" status
- [ ] `npm run build` completes without errors

---

**Output when complete:** `<promise>DONE</promise>`

<!-- NR_OF_TRIES: 0 -->
