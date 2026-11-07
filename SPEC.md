# QC comp announcer: spec

Posts an announcement in the QC Discord for every new WCA competition in Quebec.

## Behavior
- **Runtime**: one discord.js bot process on a GCP e2-micro VM (systemd), env `DISCORD_TOKEN`, `ANNOUNCE_CHANNEL_ID`.
- **Check**: every 5 minutes the bot looks for new comps and posts them in `ANNOUNCE_CHANNEL_ID`.
- **Scope**: WCA competitions with `country_iso2=CA` whose `city` ends with `, Quebec`.
- **New comp**: `announced_at` is within the 5-minute window `[end - 5 min, end)`, where `end` is a multiple of 5 minutes. Each window is checked 2 minutes after it ends, to allow for WCA list lag. Windows tile time with no overlap, so each comp is posted once, within about 2 to 7 minutes of being announced. Restarts don't backfill or repeat a window.
- **Output**: one message per new comp, pinging @everyone.
- **Errors**: a failed check is logged and retried up to 3 times, 1 minute apart, for the same window; after that the window is skipped.
- **Logs** (`journalctl -u qc-bot`): every `/announce` (posted, preview, not found, failed, with user and channel), every automatic post, failed checks, and an `alive` line each hour.

## `/announce url:<comp URL or id> [private:true|false]`
- Builds the message for that comp (any comp, Quebec or not).
- `private` false (default): the bot posts the message as a new message in the current channel, pinging @everyone, and confirms to the sender privately.
- `private` true: ephemeral reply only the sender sees; no ping. For previews and testing.
- Only members with the "Mention @everyone" permission see the command, so it can't be used to spam pings.
- Invalid URL or unknown comp: ephemeral error message.
- Reply is deferred first, so slow WCA responses don't hit Discord's 3 s limit.
- Commands are registered at bot startup.

## `/projet nom:<nom>`
- Creates a category `<nom>` placed right above category `1019989519166095360`, visible only to Administrateur, Modérateur, Délégué WCA and Organisateur.
- Inside it: `<nom>-public` (same roles) and `<nom>-private` (QC-Delegates only).
- Only members with "Manage Channels" see the command.
- A missing role (looked up by exact name): ephemeral error, nothing created.
- Bot needs Manage Channels and Manage Roles.

## CLI
- `node bot.js print <compId|comp URL>` prints the message to stdout, without connecting to Discord.
- `node bot.js check <hours>` runs one check over the last `<hours>` and exits. It reposts anything in that range, so it is for testing only.

## Message format
```
{name}
📍 {venue}, {venue_details}, {venue_address}
🗓️ {dates}
{Épreuve|Épreuves}: {events}
👥 Places: {competitor_limit}
<https://www.worldcubeassociation.org/competitions/{id}>

@everyone
```
- `venue`: WCA markdown link `[Name](url)` reduced to `Name`.
- Empty location parts are skipped; each part is trimmed; a trailing `, Canada` is removed from the address.
- `Épreuve` for one event, `Épreuves` otherwise.
- The link is wrapped in `<...>` so Discord shows no preview embed.

### Dates (French, lowercase months)
| Case | Example |
|---|---|
| 1 day | `29 août 2026` |
| 2 consecutive days | `10 et 11 octobre 2026` |
| 3+ days, same month | `8 - 10 mai 2026` |
| Across months | `31 octobre - 1 novembre 2026` |
| Across years | `31 décembre 2026 - 1 janvier 2027` |

### Events (in `event_ids` order, which is WCA order)
| id | name | id | name |
|---|---|---|---|
| 333 | 3x3 | clock | Horloge |
| 222 | 2x2 | minx | Mégaminx |
| 444 | 4x4 | pyram | Pyraminx |
| 555 | 5x5 | skewb | Skewb |
| 666 | 6x6 | sq1 | Square-1 |
| 777 | 7x7 | 444bf | 4x4 à l'aveugle |
| 333bf | 3x3 à l'aveugle | 555bf | 5x5 à l'aveugle |
| 333fm | FMC | 333mbf | 3x3 résolution multiple à l’aveugle |
| 333oh | 3x3 à une main | | |

## Acceptance examples
Expected output from the live WCA data.

```
FMC à Montréal 2026
📍 École de Technologie Supérieure, Salle E-4025, 1220 R. Notre Dame O, Montréal, QC H3C 1K6
🗓️ 29 août 2026
Épreuve: FMC
👥 Places: 35
<https://www.worldcubeassociation.org/competitions/FMCaMontreal2026>

@everyone
```

```
Imaginaire Québec 2026
📍 Boutique Imaginaire de Laurier, Troisième étage, à côté du magasin Imaginaire, 2740 Boulevard Laurier, Quebec, QC, G1V4P7
🗓️ 10 et 11 octobre 2026
Épreuves: 3x3, 2x2, 4x4, 5x5, 3x3 à une main, Horloge, Mégaminx, Pyraminx, Skewb, Square-1
👥 Places: 60
<https://www.worldcubeassociation.org/competitions/ImaginaireQuebec2026>

@everyone
```

```
Gros Jouets à Montréal 2026
📍 École de Technologie Supérieure, Pavillon E, salon des diplômés Vidéotron, 1100 Notre-Dame W, Montreal, QC H3C 1K3
🗓️ 25 et 26 avril 2026
Épreuves: 4x4, 5x5, 6x6, 7x7, Mégaminx, 4x4 à l'aveugle, 5x5 à l'aveugle
👥 Places: 60
<https://www.worldcubeassociation.org/competitions/GrosJouetsaMontreal2026>

@everyone
```

```
Championnat Québécois 2026
📍 Pavillon Alphonse-Desjardins, Cercle Universitaire ADJ-4512 (Vendredi) et Grand Salon POL-2244 (Samedi et Dimanche), 2305, rue de l’Université, Québec (Québec) G1V 0A6
🗓️ 8 - 10 mai 2026
Épreuves: 3x3, 2x2, 4x4, 5x5, 6x6, 7x7, 3x3 à l'aveugle, 3x3 à une main, Horloge, Mégaminx, Pyraminx, Skewb, Square-1, 4x4 à l'aveugle, 5x5 à l'aveugle
👥 Places: 160
<https://www.worldcubeassociation.org/competitions/ChampionnatQuebecois2026>

@everyone
```

## Out of scope
Editing or deleting posts, non-Quebec comps in the automatic check, cancellation notices, intro lines like "Le second championnat provincial du Québec est arrivé!".
