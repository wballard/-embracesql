# SQL Scripts

You can create a directory tree full of parameterized SQL scripts that
EmbraceSQL will inspect and generate strongly typed TypeScript wrappers.

These wrappers are callable as async functions, with typed parameter inputs and
typed row outputs. No need to ever create 'pojo' types to get intellisense on
your queries ever again!

## Example

... specify the root folder where to look for scripts

You can look in the [intro](./index.md) to see how to generate the dvdrental code
used in these example snippets.

You can even have `.sql` file scripts that will generate typed wrappers.

Make a file `./src/sql/pick.sql`. Notice the use of Postgres style parameters with $<number>
where number is one based.

```sql
SELECT
    *
FROM
    public.film
WHERE
    title = $1
```

Generate some code -- notice the `--sqlScriptsFrom` switch.

```shell
embracesql generate typescript-node --database postgres://postgres:postgres@localhost/dvdrental --sqlScriptsFrom ./src/sql > ./src/dvdrental.ts

```

And call your SQL script as a strongly typed function

```typescript
import { Database } from "./src/dvdrental";
    
const db = await Database.connect("postgres://postgres:postgres@localhost:5432/dvdrental");
const value = await db.Scripts.Sql.Sample.pick({ _1: "Basic Easy" });
await db.disconnect();
```
