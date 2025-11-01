## esvierneshoy.com

Static single-page site that answers **Es viernes hoy?** in the visitor's own timezone. Everything runs client side, so the exported build can be uploaded directly to a Simply.com webhotel. Optional PHP/MySQL backend keeps a permanent visit log.

### How it works
- The page detects the user's local timezone with `Intl.DateTimeFormat`.
- It classifies the current date into a season (winter/spring/summer/autumn) using the configured hemisphere (`NEXT_PUBLIC_HEMISPHERE`, default "north").
- It chooses a random image from `public/ai/<mood>/<season>/`, where `<mood>` is `friday` or `not-friday`. If the seasonal folder is empty it falls back to the base folder, and finally to `latest-fiesta.jpg` / `latest-work.jpg` if nothing else is available.
- Copy and styles live in `src/app/page.tsx`. No API calls are required.

### Preparing your galleries
1. Place celebratory images in `public/ai/friday/` and grey "not Friday" images in `public/ai/not-friday/`.
2. Within each mood folder you can optionally add `winter`, `spring`, `summer`, `autumn` subfolders for seasonal variations.
3. Run `npm run dev` or `npm run build`; a pre-build step (`scripts/generate-gallery.mjs`) scans those folders and writes `public/ai/gallery-manifest.json` automatically.
4. Reload the page to see a new random image per visit. Add or remove files, rebuild, and re-upload whenever you want to refresh the galleries.

### Visit logging backend (Simply.com PHP + MySQL)
1. **Opret database:** I Simply.com-kontrolpanelet laver du en MySQL-database og noterer host, database, bruger og kode.
2. **Uploade kode:** Kopiér `php/config.example.php` til `php/config.php`, udfyld værdierne (inkl. `STATS_DEFAULT_USER` og `STATS_DEFAULT_PASSWORD`) og upload `php/config.php`, `php/stats.php` samt hele mappen `php/stats/` til webhotellets rod (så `stats.php` er tilgængelig på `https://ditdomæne/stats.php` og `stats/index.php` på `https://ditdomæne/stats/`). Tabellen `visit_logs` oprettes automatisk ved første besøg, men `php/schema.sql` kan køres manuelt hvis du vil sikre skemaet på forhånd.
3. **Tillad oprindelse:** Sæt `ALLOWED_ORIGIN` i `config.php` til din live-URL (fx `https://esvierneshoy.com`), så CORS accepterer forespørgsler fra frontenden.
4. **Frontend-konfiguration:** Tilføj `NEXT_PUBLIC_STATS_ENDPOINT=https://ditdomæne/stats.php` til `.env.local` inden du kører `npm run dev`/`npm run build`. Den statiske eksport vil herefter poste hver besøgende til PHP-endpointet og data forbliver i tabellen.
5. **Statistikside:** Efter upload kan du besøge `https://ditdomæne/stats/` for at se totaler, topzoner, daglige hits og de seneste besøgende. Første gang du åbner siden, indsættes brugeren fra `STATS_DEFAULT_*` automatisk; opdatér enten værdierne i databasen (tabellen `stats_users`) eller i `config.php` og slet/erstat brugeren, så du har dine egne sikre loginoplysninger. Brug “Log out” linket i toppen for at afslutte sessionen.

Hver logpost indeholder tidszone, om det er fredag, tvangstilstand, sæson, genereringstidspunkt, IP og user-agent. Tabellen nulstilles aldrig, medmindre du selv rydder den.

### Useful scripts
```bash
npm install        # install dependencies
npm run dev        # start local dev server
npm run build      # generate static export in ./out and dist/esvierneshoy.zip (prebuild step regenerates gallery manifest)
npm run lint       # ESLint checks
```

### Deploying to Simply.com
1. Run `npm run build` lokalt; den statiske eksport ligger derefter i `out/`-mappen og i zipfilen `dist/esvierneshoy.zip`.
2. Upload either `dist/esvierneshoy.zip` (og udpak den i `public_html`) eller hele `out/` manuelt til Simply.com.
3. Point `esvierneshoy.com` to the webhotel. The page will now serve entirely from static assets.

### Optional tweaks
- Set `NEXT_PUBLIC_HEMISPHERE=south` in a `.env.local` before building if most visitors are in the southern hemisphere.
- Append `?force=friday` or `?force=no` to the URL to preview either state without changing your system date.

Enjoy shouting **SI!** when the right day arrives.
