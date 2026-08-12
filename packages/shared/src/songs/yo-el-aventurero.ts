import { songSchema } from "../model.js";
/**
 * Pedro Fernández — Yo el aventurero
 * Audio: apps/web/public/audio/pedro-fernandez-yo-el-aventurero.mp3 (~181.44 s)
 *
 * Tiempos = primera aproximación (reparto uniforme afinable).
 * En partida usa calibración ±0.5 s; luego ajustamos `start`/`end` aquí.
 * Duración alineada al MP3 real (antes 197.5 dejaba el outro fuera del audio).
 */
const AUDIO_DURATION = 181.44;
const blocks = [
    {
        section: "intro-1",
        type: "intro",
        lines: [
            "Ay, lara-la; ay, lara-la; ay, lara-lara-lala",
            "Ay, lara-la; ay, lara-la; ay, lara-lara-lala",
        ],
    },
    {
        section: "verse-1",
        type: "verse",
        lines: [
            "Yo soy el aventurero",
            "el mundo me importa poco",
            "Cuando una mujer me gusta",
            "me gusta a pesar de todo",
        ],
    },
    {
        section: "list-1",
        type: "chorus",
        lines: [
            "Me gustan las altas y las chaparritas",
            "Las flacas, las gordas y las chiquititas",
            "Solteras y viudas y divorciaditas",
            "Me encantan las chatas de caras bonitas",
        ],
    },
    {
        section: "bridge-1",
        type: "bridge",
        lines: [
            "Y por eso digo así cantando con mi canción",
            "Yo soy el aventurero puritito corazón",
            "¿Verdad de Dios que sí, compadrito?",
            "Échele que suene, que suene homero",
        ],
    },
    {
        section: "hook-2",
        type: "chorus",
        lines: [
            "Ay, lara-la; ay, lara-la; ay, lara-lara-lala",
            "Ay, lara-la; ay, lara-la; ay, lara-lara-lala",
        ],
    },
    {
        section: "verse-2",
        type: "verse",
        lines: [
            "El mundo me importa poco",
            "y hago de mí lo que quiero",
            "Soy honrado, buen amigo",
            "vacilador mas sincero",
        ],
    },
    {
        section: "list-2",
        type: "chorus",
        lines: [
            "Yo juego baraja y sé parrandear",
            "Lo mismo les tomo tequila o mezcal",
            "Yo le entro al pulquito también al champán",
            "Lo mismo les bailo que un tango que un vals",
            "Lo mismo un jarabe que algún chachachá",
        ],
    },
    {
        section: "spoken-1",
        type: "bridge",
        lines: [
            "También bailo break",
            "Y hasta lo que no han inventado compadre",
            "Yo soy el aventurero y a mis suegras les respondo",
            "Que si traen a sus hijitas, me las cuiden o no respondo",
            "Verdad de Dios, ¿que no?",
            "Yo agarro parejo, parejo parejo compadrito",
        ],
    },
    {
        section: "hook-3",
        type: "chorus",
        lines: [
            "Ay, lara-la; ay, lara-la; ay, lara-lara-lala",
            "Ay, lara-la; ay, lara-la; ay, lara-lara-lala",
        ],
    },
    {
        section: "verse-3",
        type: "verse",
        lines: [
            "Yo soy el aventurero",
            "el mundo me importa poco",
            "Cuando una mujer me gusta",
            "me gusta a pesar de todo",
        ],
    },
    {
        section: "list-3",
        type: "chorus",
        lines: [
            "Me gustan las altas y las chaparritas",
            "Las flacas, las gordas y las chiquititas",
            "Solteras y viudas y divorciaditas",
            "Me encantan las chatas de caras bonitas",
            "Me gustan las suegras que no son celosas",
            "Me encantan las chatas poco resbalosas",
            "Que tengan mamases muy buenas señoras",
            "Me encantan las gordas retejaladoras",
            "Que tengan hermanos que no sean celosos",
            "Que tengan sus novios caras de babosos",
            "Me encanta la vida, me gusta el amor",
            "Soy aventurero revacilador",
        ],
    },
    {
        section: "outro",
        type: "outro",
        lines: [
            "Se me fue el aire, fue horrible, fue horrible",
            "Y por eso tengo el alma de trovador y bohemio",
            "Yo soy el aventurero, buenas tardes y ahí nos vemos",
            "Ay, lara-la; ay, lara-la",
            "Aventurero yo soy",
        ],
    },
];
function buildSong() {
    const id = "pedro-fernandez-yo-el-aventurero";
    const flat = blocks.flatMap((block) => block.lines.map((text) => ({ text, section: block.section, type: block.type })));
    const startAt = 5;
    const endAt = AUDIO_DURATION - 1.5;
    const span = endAt - startAt;
    const slot = span / flat.length;
    const lines = flat.map((item, index) => {
        const start = startAt + index * slot;
        const end = startAt + (index + 1) * slot - 0.15;
        return {
            id: `${id}-line-${index + 1}`,
            start: Number(start.toFixed(2)),
            end: Number(Math.min(end, AUDIO_DURATION - 0.2).toFixed(2)),
            text: item.text,
            sectionId: `${id}-${item.section}`,
        };
    });
    const sectionKeys = [...new Set(flat.map((item) => item.section))];
    const sections = sectionKeys.map((sectionKey) => {
        const type = flat.find((item) => item.section === sectionKey)!.type;
        const sectionLines = lines.filter((line) => line.sectionId === `${id}-${sectionKey}`);
        return {
            id: `${id}-${sectionKey}`,
            type,
            start: sectionLines[0]!.start,
            end: sectionLines[sectionLines.length - 1]!.end,
            lineIds: sectionLines.map((line) => line.id),
        };
    });
    const chorus = sections.find((section) => section.id.endsWith("list-1")) ?? sections[0]!;
    return songSchema.parse({
        id,
        title: "Yo el aventurero",
        artist: "Pedro Fernández",
        duration: AUDIO_DURATION,
        genre: "ranchera",
        difficulty: "medium",
        chorusStart: chorus.start,
        sections,
        lines,
        audioSource: {
            type: "local",
            path: "/audio/pedro-fernandez-yo-el-aventurero.mp3",
        },
    });
}
export const yoElAventurero = buildSong();
