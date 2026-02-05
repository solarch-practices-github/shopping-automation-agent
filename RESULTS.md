# Performance Metrics by Commit

| Commit | Key Changes | Duration (s) | Cost ($) | Turns | Input Tokens | Cache Creation | Cache Read | Output Tokens | Total Input |
|--------|-------------|--------------|----------|-------|--------------|----------------|------------|---------------|-------------|
| 0e299fe | ⚡️Minor prompt updates | 88.7 | 0.0700 | 2 | 8 | 550 | 31,678 | 591 | 32,236 |
| 7cfa89d | On main: 999 | 120.8 | 0.1021 | 2 | 8 | 620 | 31,678 | 616 | 32,306 |
| 3b09903 | 🎨 Improve prompt & change model to haiku | 86.3 | 0.0736 | 16 | 80 | 13,191 | 381,064 | 3,746 | 394,335 |
| 5179445 | Add browser_hover action | 113.2 | 0.0981 | 17 | 99 | 25,871 | 454,349 | 3,995 | 480,319 |
| 1f24bc3 | Changed prompt | 117.9 | 0.0796 | 15 | 83 | 16,411 | 381,538 | 4,140 | 398,032 |
| 8a788f2 | Initial implementation | 103.0 | 0.0836 | 15 | 84 | 23,018 | 385,695 | 3,207 | 408,797 |

## Key Observations

- **Best Performance**: Commit 0e299fe - 88.7s duration, $0.0700 cost (with minimal 2 turns)
- **Most Expensive**: Commit 7cfa89d - $0.1021 cost
- **Most Turns**: Commit 5179445 - 17 turns
- **Cache Efficiency**: All commits show excellent cache hit rates (90%+ of tokens from cache reads)
- **Agent Architecture Impact**: Switch to haiku model (commit 3b09903) maintained performance while reducing cost

## Notes

- Merchant site load and network speed could be considered as external dependency
- Prompt is not constant - may need additional instructions over time
- Browser snapshots & READ tools often cause issues because of the amount of tokens we have in context after using those tools. We need to avoid them

---




## Raw Data Archive

Duration: 103.0s
Cost: $0.0836

Token Usage:
  Input: 84
  Cache creation: 23018 (storing context for reuse, costs 25% more)
  Cache read: 385695 (reusing stored context, 90% cheaper)
  Output: 3207
  Total input (including cache): 408797
  
Turns: 15




Duration: 117.9s
Cost: $0.0796

Token Usage:
  Input: 83
  Cache creation: 16411 (storing context for reuse, costs 25% more)
  Cache read: 381538 (reusing stored context, 90% cheaper)
  Output: 4140
  Total input (including cache): 398032

Turns: 15



Duration: 117.9s
Cost: $0.0796

Token Usage:
  Input: 83
  Cache creation: 16411 (storing context for reuse, costs 25% more)
  Cache read: 381538 (reusing stored context, 90% cheaper)
  Output: 4140
  Total input (including cache): 398032

Turns: 15

------

Merchant site load  and network speed could be considered as external dependency

-----

I would not consider the prompt as something constant because we might need to add more instructions into it.


Duration: 113.2s
Cost: $0.0981

Token Usage:
  Input: 99
  Cache creation: 25871 (storing context for reuse, costs 25% more)
  Cache read: 454349 (reusing stored context, 90% cheaper)
  Output: 3995
  Total input (including cache): 480319
Turns: 17


Duration: 86.3s
Cost: $0.0736

Token Usage:
  Input: 80
  Cache creation: 13191 (storing context for reuse, costs 25% more)
  Cache read: 381064 (reusing stored context, 90% cheaper)
  Output: 3746
  Total input (including cache): 394335
Turns: 16




Duration: 120.8s
Cost: $0.1021

Token Usage:
  Input: 8
  Cache creation: 620 (storing context for reuse, costs 25% more)
  Cache read: 31678 (reusing stored context, 90% cheaper)
  Output: 616
  Total input (including cache): 32306
Turns: 2



Duration: 88.7s
Cost: $0.0700

Token Usage:
  Input: 8
  Cache creation: 550 (storing context for reuse, costs 25% more)
  Cache read: 31678 (reusing stored context, 90% cheaper)
  Output: 591
  Total input (including cache): 32236
Turns: 2



Duration: 108.4s
Cost: $0.1145

Token Usage:
  Input: 8
  Cache creation: 16217 (storing context for reuse, costs 25% more)
  Cache read: 15270 (reusing stored context, 90% cheaper)
  Output: 636
  Total input (including cache): 31495
Turns: 2

