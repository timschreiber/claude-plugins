# Cart

A tiny shopping-cart library.

- `src/cart.js`: `getItemTotal(line)` is one line's total in cents; `cartTotal(lines)` sums them.
- `src/format.js`: `formatPrice(cents)` formats cents as dollars.
- `src/report.js`: `report(lines)` prints one row per line and a total.

A cart line is `{ name, priceCents, qty }`. Run the tests with `node --test`.
