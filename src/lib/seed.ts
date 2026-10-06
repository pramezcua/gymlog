import { db, uid, type Exercise, type Muscle, type Routine } from '../db';

const EXERCISES: [string, Muscle, string][] = [
  ['Press banca', 'pecho', 'Escápulas retraídas y deprimidas. Barra al esternón bajo, codos a ~45°.'],
  ['Press inclinado mancuernas', 'pecho', 'Banco a 30°. Bajada controlada hasta estiramiento.'],
  ['Press militar', 'hombro', 'Glúteos y abdomen apretados. Cabeza atrás al pasar la barra.'],
  ['Elevaciones laterales', 'hombro', 'Codo ligeramente flexionado, subir hasta la horizontal.'],
  ['Fondos en paralelas', 'tríceps', 'Torso erguido para enfatizar tríceps.'],
  ['Extensión tríceps polea', 'tríceps', 'Codos fijos pegados al cuerpo.'],
  ['Dominadas', 'espalda', 'Iniciar desde escápulas. Pecho hacia la barra.'],
  ['Remo con barra', 'espalda', 'Torso a ~45°, espalda neutra, tirar hacia el ombligo.'],
  ['Jalón al pecho', 'espalda', 'Sin balanceo; codos hacia abajo y atrás.'],
  ['Remo en polea baja', 'espalda', 'Pausa de 1 s en contracción.'],
  ['Curl con barra', 'bíceps', 'Sin balanceo del torso.'],
  ['Curl martillo', 'bíceps', 'Agarre neutro, alternando.'],
  ['Sentadilla', 'cuádriceps', 'Rodillas siguiendo la punta de los pies. Profundidad hasta paralelo o más.'],
  ['Prensa', 'cuádriceps', 'No despegar la zona lumbar del respaldo.'],
  ['Peso muerto rumano', 'isquios', 'Cadera atrás, barra pegada a las piernas, rodillas semiflexionadas.'],
  ['Curl femoral', 'isquios', 'Controlar la fase excéntrica.'],
  ['Hip thrust', 'glúteo', 'Barbilla al pecho, bloqueo con glúteo arriba.'],
  ['Elevación de gemelos', 'gemelo', 'Pausa abajo en estiramiento.'],
  ['Plancha', 'core', 'Registrar segundos como reps.'],
  ['Bicicleta estática', 'cardio', 'Ajusta el sillín a la altura de la cadera.'],
  ['Cinta de correr', 'cardio', 'Inclinación 1 % para simular el exterior.'],
];

export async function seedIfEmpty() {
  if ((await db.exercises.count()) > 0) return;
  const t = Date.now();
  const ex: Exercise[] = EXERCISES.map(([name, muscle, notes]) => ({ id: uid(), name, muscle, notes, media: [], updatedAt: t }));
  const byName = (n: string) => ex.find(e => e.name === n)!.id;
  const item = (n: string, sets: number, min: number, max: number, rpe?: number, restSec?: number) =>
    ({ exerciseId: byName(n), targetSets: sets, repsMin: min, repsMax: max, targetRpe: rpe, restSec });

  const routines: Routine[] = [
    { id: uid(), name: 'Empuje', type: 'Push', color: '#f97316', defaultRestSec: 120, updatedAt: t, items: [
      item('Press banca', 4, 6, 8, 8, 180), item('Press inclinado mancuernas', 3, 8, 10, 8),
      item('Press militar', 3, 6, 8, 8, 150), item('Elevaciones laterales', 3, 12, 15, 9, 60),
      item('Extensión tríceps polea', 3, 10, 12, 9, 60),
    ] },
    { id: uid(), name: 'Jalón', type: 'Pull', color: '#38bdf8', defaultRestSec: 120, updatedAt: t, items: [
      item('Dominadas', 4, 6, 8, 8, 150), item('Remo con barra', 3, 8, 10, 8),
      item('Jalón al pecho', 3, 10, 12, 8), item('Remo en polea baja', 3, 10, 12, 8, 90),
      item('Curl con barra', 3, 8, 10, 9, 60), item('Curl martillo', 2, 10, 12, 9, 60),
    ] },
    { id: uid(), name: 'Pierna', type: 'Legs', color: '#a3e635', defaultRestSec: 150, updatedAt: t, items: [
      item('Sentadilla', 4, 5, 8, 8, 180), item('Peso muerto rumano', 3, 8, 10, 8, 150),
      item('Prensa', 3, 10, 12, 8), item('Curl femoral', 3, 10, 12, 9, 90),
      item('Hip thrust', 3, 8, 12, 8), item('Elevación de gemelos', 4, 10, 15, 9, 60),
    ] },
  ];
  await db.transaction('rw', [db.exercises, db.routines], async () => {
    await db.exercises.bulkAdd(ex);
    await db.routines.bulkAdd(routines);
  });
}
