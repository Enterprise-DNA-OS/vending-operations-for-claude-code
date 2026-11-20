---
description: Warehouse stock by product: on hand, the earliest date mark, what the fleet sells a day and the days of cover.
---

Run `npm run vending -- stock --json`.

List anything under seven days of cover as a reorder, with a suggested quantity in whole cases (two weeks of sales, rounded up to the case size in `products`). Name any delivery whose date mark is close. Record a delivery with `/receive`.
