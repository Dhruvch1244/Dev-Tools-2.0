// Exercise library. Pure data + search, no React.
// Encoded compactly as "Name|Equipment" per muscle group; names are what gets logged, so keep them stable.

import type { DayType } from './gym';

export type Muscle = 'Chest' | 'Back' | 'Shoulders' | 'Rear delts' | 'Biceps' | 'Triceps' | 'Forearms' | 'Quads' | 'Hamstrings' | 'Glutes' | 'Calves' | 'Core' | 'Traps' | 'Cardio';
export type Equipment = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Smith' | 'Kettlebell' | 'Band' | 'EZ-bar' | 'Plate' | 'Trap bar';
export type Exercise = { name: string; muscle: Muscle; equipment: Equipment };

const RAW: Record<Muscle, string> = {
  Chest: `Barbell Bench Press|Barbell; Incline Barbell Press|Barbell; Decline Barbell Press|Barbell; Close-Grip Bench Press|Barbell; Paused Bench Press|Barbell; Floor Press|Barbell;
    Dumbbell Bench Press|Dumbbell; Incline Dumbbell Press|Dumbbell; Decline Dumbbell Press|Dumbbell; Dumbbell Fly|Dumbbell; Incline Dumbbell Fly|Dumbbell; Dumbbell Pullover|Dumbbell; Squeeze Press|Dumbbell;
    Cable Crossover|Cable; Low-to-High Cable Fly|Cable; High-to-Low Cable Fly|Cable; Single-Arm Cable Press|Cable;
    Machine Chest Press|Machine; Incline Machine Press|Machine; Pec Deck|Machine; Hammer Strength Chest Press|Machine;
    Smith Machine Bench Press|Smith; Smith Incline Press|Smith;
    Push-up|Bodyweight; Weighted Push-up|Plate; Deficit Push-up|Bodyweight; Diamond Push-up|Bodyweight; Chest Dip|Bodyweight; Weighted Chest Dip|Plate; Svend Press|Plate`,
  Back: `Conventional Deadlift|Barbell; Sumo Deadlift|Barbell; Trap Bar Deadlift|Trap bar; Rack Pull|Barbell; Barbell Row|Barbell; Pendlay Row|Barbell; Yates Row|Barbell; T-Bar Row|Barbell; Seal Row|Barbell; Meadows Row|Barbell;
    Dumbbell Row|Dumbbell; Chest-Supported Row|Dumbbell; Kroc Row|Dumbbell; Renegade Row|Dumbbell;
    Lat Pulldown|Cable; Close-Grip Lat Pulldown|Cable; Single-Arm Lat Pulldown|Cable; Straight-Arm Pulldown|Cable; Seated Cable Row|Cable; Wide-Grip Cable Row|Cable; Single-Arm Cable Row|Cable;
    Machine Row|Machine; Hammer Strength Row|Machine; Assisted Pull-up|Machine; Machine Pullover|Machine; Back Extension|Machine;
    Pull-up|Bodyweight; Chin-up|Bodyweight; Weighted Pull-up|Plate; Weighted Chin-up|Plate; Neutral-Grip Pull-up|Bodyweight; Inverted Row|Bodyweight; Band Pull-apart|Band`,
  Shoulders: `Overhead Press|Barbell; Push Press|Barbell; Seated Barbell Press|Barbell; Behind-the-Neck Press|Barbell; Landmine Press|Barbell;
    Dumbbell Shoulder Press|Dumbbell; Arnold Press|Dumbbell; Seated Dumbbell Press|Dumbbell; Lateral Raise|Dumbbell; Seated Lateral Raise|Dumbbell; Lean-Away Lateral Raise|Dumbbell; Front Raise|Dumbbell; Y-Raise|Dumbbell;
    Cable Lateral Raise|Cable; Cable Front Raise|Cable; Cable Y-Raise|Cable;
    Machine Shoulder Press|Machine; Machine Lateral Raise|Machine; Smith Machine Shoulder Press|Smith;
    Pike Push-up|Bodyweight; Handstand Push-up|Bodyweight; Plate Front Raise|Plate; Upright Row|Barbell; Cable Upright Row|Cable`,
  'Rear delts': `Face Pull|Cable; Reverse Pec Deck|Machine; Rear Delt Fly|Dumbbell; Chest-Supported Rear Delt Fly|Dumbbell; Cable Rear Delt Fly|Cable; Rear Delt Row|Dumbbell; Band Face Pull|Band`,
  Biceps: `Barbell Curl|Barbell; EZ-Bar Curl|EZ-bar; Preacher Curl|EZ-bar; Reverse Curl|EZ-bar; Drag Curl|Barbell;
    Dumbbell Curl|Dumbbell; Hammer Curl|Dumbbell; Incline Dumbbell Curl|Dumbbell; Concentration Curl|Dumbbell; Spider Curl|Dumbbell; Zottman Curl|Dumbbell; Cross-Body Hammer Curl|Dumbbell; Dumbbell Preacher Curl|Dumbbell;
    Cable Curl|Cable; Rope Hammer Curl|Cable; Bayesian Cable Curl|Cable; High Cable Curl|Cable; Machine Preacher Curl|Machine; Chin-up (biceps focus)|Bodyweight`,
  Triceps: `Close-Grip Bench|Barbell; Skull Crusher|EZ-bar; JM Press|Barbell;
    Overhead Dumbbell Extension|Dumbbell; Dumbbell Kickback|Dumbbell; Dumbbell Skull Crusher|Dumbbell; Tate Press|Dumbbell;
    Triceps Pushdown|Cable; Rope Pushdown|Cable; Reverse-Grip Pushdown|Cable; Overhead Cable Extension|Cable; Single-Arm Pushdown|Cable; Cable Kickback|Cable;
    Machine Dip|Machine; Machine Triceps Extension|Machine; Triceps Dip|Bodyweight; Bench Dip|Bodyweight; Diamond Push-up (triceps)|Bodyweight`,
  Forearms: `Wrist Curl|Dumbbell; Reverse Wrist Curl|Dumbbell; Behind-the-Back Wrist Curl|Barbell; Farmer's Carry|Dumbbell; Dead Hang|Bodyweight; Plate Pinch|Plate; Wrist Roller|Plate`,
  Traps: `Barbell Shrug|Barbell; Dumbbell Shrug|Dumbbell; Trap Bar Shrug|Trap bar; Cable Shrug|Cable; Smith Machine Shrug|Smith`,
  Quads: `Back Squat|Barbell; Front Squat|Barbell; High-Bar Squat|Barbell; Low-Bar Squat|Barbell; Pause Squat|Barbell; Box Squat|Barbell; Zercher Squat|Barbell;
    Goblet Squat|Dumbbell; Bulgarian Split Squat|Dumbbell; Walking Lunge|Dumbbell; Reverse Lunge|Dumbbell; Step-up|Dumbbell; Heel-Elevated Goblet Squat|Dumbbell;
    Leg Press|Machine; Hack Squat|Machine; Pendulum Squat|Machine; Belt Squat|Machine; Leg Extension|Machine; Single-Leg Extension|Machine; V-Squat|Machine;
    Smith Machine Squat|Smith; Smith Split Squat|Smith; Sissy Squat|Bodyweight; Pistol Squat|Bodyweight; Wall Sit|Bodyweight; Kettlebell Goblet Squat|Kettlebell`,
  Hamstrings: `Romanian Deadlift|Barbell; Stiff-Leg Deadlift|Barbell; Good Morning|Barbell; Dumbbell Romanian Deadlift|Dumbbell; Single-Leg RDL|Dumbbell;
    Lying Leg Curl|Machine; Seated Leg Curl|Machine; Standing Leg Curl|Machine; Nordic Curl|Bodyweight; Glute-Ham Raise|Machine; Swiss Ball Leg Curl|Bodyweight; Cable Pull-through|Cable; Kettlebell Swing|Kettlebell`,
  Glutes: `Hip Thrust|Barbell; Glute Bridge|Barbell; Single-Leg Hip Thrust|Bodyweight; Machine Hip Thrust|Machine; Cable Kickback (glute)|Cable; Hip Abduction|Machine; Cable Hip Abduction|Cable;
    Sumo Squat|Dumbbell; Curtsy Lunge|Dumbbell; Frog Pump|Bodyweight; Banded Lateral Walk|Band; 45° Hip Extension|Machine`,
  Calves: `Standing Calf Raise|Machine; Seated Calf Raise|Machine; Leg Press Calf Raise|Machine; Smith Calf Raise|Smith; Single-Leg Calf Raise|Dumbbell; Donkey Calf Raise|Machine; Tibialis Raise|Bodyweight`,
  Core: `Hanging Leg Raise|Bodyweight; Hanging Knee Raise|Bodyweight; Toes-to-Bar|Bodyweight; Cable Crunch|Cable; Ab Wheel Rollout|Bodyweight; Plank|Bodyweight; Side Plank|Bodyweight; Weighted Plank|Plate;
    Decline Crunch|Bodyweight; Russian Twist|Plate; Pallof Press|Cable; Woodchopper|Cable; Dead Bug|Bodyweight; Hollow Hold|Bodyweight; Dragon Flag|Bodyweight; Machine Crunch|Machine; L-Sit|Bodyweight; Suitcase Carry|Dumbbell`,
  Cardio: `Treadmill Walk (incline)|Machine; Treadmill Run|Machine; Stationary Bike|Machine; Rowing Machine|Machine; Stair Climber|Machine; Elliptical|Machine; Assault Bike|Machine;
    Jump Rope|Bodyweight; Burpee|Bodyweight; Sled Push|Machine; Battle Ropes|Band; Kettlebell Snatch|Kettlebell; Box Jump|Bodyweight`,
};

export const EXERCISES: Exercise[] = (Object.entries(RAW) as [Muscle, string][]).flatMap(([muscle, s]) =>
  s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [name, equipment] = x.split('|');
      return { name: name.trim(), equipment: equipment.trim() as Equipment, muscle };
    }),
);

export const MUSCLES = Object.keys(RAW) as Muscle[];

/** Which muscles a day of the split trains — the picker opens filtered to these. */
export const DAY_MUSCLES: Record<DayType, Muscle[]> = {
  push: ['Chest', 'Shoulders', 'Triceps'],
  pull: ['Back', 'Rear delts', 'Biceps', 'Forearms', 'Traps'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  upper: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'],
  rest: ['Cardio', 'Core'],
};

export const muscleOf = (name: string) => EXERCISES.find((e) => e.name === name)?.muscle;

export function searchExercises(q: string, muscles: Muscle[] | null) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return EXERCISES.filter((e) => (!muscles || muscles.includes(e.muscle)) && words.every((w) => `${e.name} ${e.equipment} ${e.muscle}`.toLowerCase().includes(w)));
}
