import { SceneData } from '../types/video';

import ghibli1 from '../assets/images/ghibli_scene_1_newborn_1794418772042.jpg';
import ghibli2 from '../assets/images/ghibli_scene_2_park_1794418773289.jpg';
import ghibli3 from '../assets/images/ghibli_scene_3_sunset_1794418774560.jpg';

export const SCENES: SceneData[] = [
  {
    id: 1,
    title: 'El Comienzo del Amor',
    subtitle: 'Escena 1 (0:00 - 0:03)',
    startTime: 0,
    endTime: 3,
    ghibliImg: ghibli1,
    realImg: '/assets/aistudio/papa_hija_1_a594c11a.jpeg',
    cameraStart: { scale: 1.0, x: 0, y: 0 },
    cameraEnd: { scale: 1.08, x: -1.5, y: -1.0 },
    particles: 'dust',
    description: 'Papá en sus 20s arrullando tiernamente a su bebé recién nacida en una habitación bañada por la luz dorada matinal.',
    quote: 'El día en que te sostuve por primera vez en mis brazos, mi mundo entero encontró su propósito.',
  },
  {
    id: 2,
    title: 'Risas y Primeros Pasos',
    subtitle: 'Escena 2 (0:03 - 0:06)',
    startTime: 3,
    endTime: 6,
    ghibliImg: ghibli2,
    realImg: '/assets/aistudio/hija_papa_2_f82644df.jpeg',
    cameraStart: { scale: 1.06, x: -3, y: 0 },
    cameraEnd: { scale: 1.0, x: 2, y: -0.5 },
    particles: 'sakura',
    description: 'En el parque en primavera, papá ríe feliz con su hija mientras los pétalos de cerezo flotan en la brisa.',
    quote: 'Tus risas convirtieron cada parque en nuestro lugar favorito del universo.',
  },
  {
    id: 3,
    title: 'Siempre Juntos',
    subtitle: 'Escena 3 (0:06 - 0:10)',
    startTime: 6,
    endTime: 10,
    ghibliImg: ghibli3,
    realImg: '/assets/aistudio/familioa_completa__cd98b4fe.jpeg',
    cameraStart: { scale: 1.08, x: 2, y: 1 },
    cameraEnd: { scale: 1.0, x: 0, y: 0 },
    particles: 'sunset',
    description: 'La familia completa camina de la mano hacia el atardecer dorado en un prado sereno.',
    quote: 'El mejor regalo es tener una gran familia. ¡Feliz Cumpleaños, Renzo!',
  },
];
