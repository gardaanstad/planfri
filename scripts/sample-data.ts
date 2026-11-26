import type { ProjectUpdate } from "../app/lib/data";
import type { SampleComment } from "./local-samples";

/**
 * Fictional updates and comments for local development only, laid over a few
 * of the production projects that `bun run db:sample` copies in. Kept out of
 * `app/` so none of it reaches a bundle, and out of the regular seed so tests
 * stay deterministic. Ids start with `sample-`; projects missing from the
 * local database are skipped. For data only one worktree needs, see
 * local-samples.ts.
 */
export const sampleUpdates: Record<string, ProjectUpdate[]> = {
  // Fornebubanen
  "prosjekt-ff2424ad": [
    {
      id: "sample-fornebu-u1",
      title: "Tunnelboremaskinen er gjennom ved Skøyen",
      body: "Etter fjorten måneder under bakken har den første tunnelboremaskinen brutt gjennom ved den nye stasjonen på Skøyen. Maskinen demonteres nå og fraktes tilbake til riggområdet på Fornebu.\n\nDet gjenstår om lag 1,8 kilometer på den sørlige løpet før all tunneldriving er ferdig.",
      date: "2026-11-18T10:00:00",
      images: [
        {
          src: "/images/fornebubanen.jpg",
          alt: "Gjennomslag i tunnelen ved Skøyen",
          credit: "Eksempelbilde",
        },
        { src: "/images/railway.jpg", alt: "Sporarbeid i tunnelen" },
      ],
    },
    {
      id: "sample-fornebu-u2",
      title: "Nattarbeid på Majorstuen i desember",
      body: "Fra 2. til 19. desember arbeides det om natten ved Majorstuen stasjon. Det blir støy fra pigging mellom klokken 23 og 06 på hverdager. Naboer innenfor 100 meter får tilbud om hotellovernatting.",
      date: "2026-10-29T14:30:00",
      sourceUrl: "https://example.com/fornebubanen-nattarbeid",
    },
  ],
  // Bybanen til Åsane
  "prosjekt-03e9afdd": [
    {
      id: "sample-bybane-u1",
      title: "Reguleringsplanen for Sandviken er vedtatt",
      body: "Bystyret vedtok reguleringsplanen for strekningen gjennom Sandviken med 51 mot 16 stemmer. Planen legger banen i tunnel under det meste av bydelen, med holdeplass ved Sandviken sykehus.",
      date: "2026-11-12T16:45:00",
    },
  ],
  // Markveien gå- og sykkelprioritert gate
  "prosjekt-527a6da1": [
    {
      id: "sample-markveien-u1",
      title: "Forslag til ny gateprofil er på høring",
      body: "Kommunen foreslår å fjerne gateparkeringen mellom Schous plass og Olaf Ryes plass, og gi plass til bredere fortau, sykkelfelt og nye trær. Varelevering skal skje fra egne lommer før klokken 11.\n\nHøringsfristen er 15. januar.",
      date: "2026-11-05T09:00:00",
      images: [
        {
          src: "/images/park.jpg",
          alt: "Illustrasjon av Markveien med trær og bredere fortau",
          credit: "Eksempelillustrasjon",
        },
      ],
    },
  ],
  // Oslo Horisont
  "prosjekt-81bd2326": [
    {
      id: "sample-horisont-u1",
      title: "Byantikvaren varsler innsigelse",
      body: "Byantikvaren mener det høyeste tårnet vil dominere utsikten fra Ekebergskråningen og ber om at høyden vurderes på nytt. Saken går videre til politisk behandling i vår.",
      date: "2026-10-21T12:00:00",
      images: [
        {
          src: "/images/architecture.jpg",
          alt: "Tårnene sett fra Ekebergskråningen",
          credit: "Eksempelillustrasjon",
        },
        { src: "/images/bjorvika.jpg", alt: "Byen sett fra fjorden" },
      ],
    },
  ],
};

export const sampleComments: SampleComment[] = [
  // Fornebubanen: a busy thread on an update, with nested replies.
  {
    id: "sample-c1",
    projectId: "prosjekt-ff2424ad",
    updateId: "sample-fornebu-u2",
    author: "majorstuboer",
    text: "Tre uker med pigging om natten rett før jul. Hvorfor kan ikke dette gjøres på dagtid?",
    date: "2026-10-29T18:02:00",
    votes: 14,
  },
  {
    id: "sample-c2",
    projectId: "prosjekt-ff2424ad",
    updateId: "sample-fornebu-u2",
    author: "kollektivnerd",
    text: "Fordi T-banen går på dagtid. Sporet må være stengt mens de jobber.",
    date: "2026-10-29T18:40:00",
    votes: 9,
    parentId: "sample-c1",
  },
  {
    id: "sample-c3",
    projectId: "prosjekt-ff2424ad",
    updateId: "sample-fornebu-u2",
    author: "majorstuboer",
    text: "Greit, det gir mening. Takk for forklaringen.",
    date: "2026-10-29T19:15:00",
    votes: 3,
    parentId: "sample-c2",
  },
  {
    id: "sample-c4",
    projectId: "prosjekt-ff2424ad",
    updateId: "sample-fornebu-u1",
    author: "fornebupendler",
    text: "Endelig! Gleder meg til å slippe bussen over Lysaker.",
    date: "2026-11-18T11:20:00",
    votes: 21,
  },
  {
    id: "sample-c5",
    projectId: "prosjekt-ff2424ad",
    author: "skeptisk_skattebetaler",
    text: "Prislappen har doblet seg siden vedtaket. Noen burde stilles til ansvar.",
    date: "2026-11-02T08:12:00",
    votes: -6,
  },
  {
    id: "sample-c6",
    projectId: "prosjekt-ff2424ad",
    author: "kollektivnerd",
    text: "Kostnadsøkningen er reell, men mye av den skyldes at prosjektet ble utvidet med flere stasjoner og bedre universell utforming etter det første vedtaket.\n\nSammenlignet med å bygge ut veinettet til Fornebu for den samme trafikken er banen fortsatt et godt kjøp, og den frigjør plass på E18 for dem som faktisk må kjøre.",
    date: "2026-11-02T09:47:00",
    votes: 17,
    parentId: "sample-c5",
  },
  {
    id: "sample-c7",
    projectId: "prosjekt-ff2424ad",
    author: "skeptisk_skattebetaler",
    text: "",
    date: "2026-11-02T10:05:00",
    votes: 0,
    parentId: "sample-c6",
    deleted: true,
  },
  // Bybanen til Åsane
  {
    id: "sample-c8",
    projectId: "prosjekt-03e9afdd",
    updateId: "sample-bybane-u1",
    author: "sandviksbuen",
    text: "Bra at det blir tunnel. Hvor kommer anleggsveien til å gå?",
    date: "2026-11-12T19:30:00",
    votes: 5,
  },
  {
    id: "sample-c9",
    projectId: "prosjekt-03e9afdd",
    author: "bergenspendler",
    text: "Når kan vi regne med byggestart?",
    date: "2026-11-20T07:50:00",
    votes: 2,
  },
  // Markveien
  {
    id: "sample-c10",
    projectId: "prosjekt-527a6da1",
    updateId: "sample-markveien-u1",
    author: "løkkasyklist",
    text: "Det er på tide. Markveien er livsfarlig å sykle i med dagens parkering.",
    date: "2026-11-05T12:14:00",
    votes: 12,
  },
  {
    id: "sample-c11",
    projectId: "prosjekt-527a6da1",
    updateId: "sample-markveien-u1",
    author: "butikkeier_markveien",
    text: "Kundene våre kommer med bil. Uten parkering mister vi dem.",
    date: "2026-11-05T13:02:00",
    votes: -2,
    parentId: "sample-c10",
  },
  // Oslo Horisont
  {
    id: "sample-c12",
    projectId: "prosjekt-81bd2326",
    updateId: "sample-horisont-u1",
    author: "ekebergutsikt",
    text: "Enig med Byantikvaren. 120 meter er for høyt rett ved siden av Oslo S.",
    date: "2026-10-22T08:30:00",
    votes: 7,
  },
];
