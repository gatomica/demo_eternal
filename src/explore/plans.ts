/**
 * plans.ts — the map, one plan per level.
 *
 * One plan per level, all on the same grid, stacked: a floor on level 2 sits right over the
 * floor of level 1 where their plans overlap.
 *   '.' floor   '@' start   '#' wall/pillar   ' ' nothing
 *   'w' a wall of wax (a wall, painted as melted candle wax)   '/' '\' metal bars across a floor tile, along that diagonal:
 *                   no way through, but you see through
 *   '◤' '◥' '◣' '◢' a diagonal tile: half floor, half wall, split corner to corner; the character
 *                   shows which half is the floor (north-west, north-east, south-west, south-east)
 *   '^' 'v' '<' '>' stairs, pointing uphill, one tile that climbs a whole level (45 degrees). They are
 *                   placed on the LOWER level; the tile past the top end must be floor on the level
 *                   above, and the tile above the stairs themselves must be empty (a hole in that
 *                   floor), so the stairs have room to rise. A climb of several levels is that many
 *                   stairs in a row, one on each level, each starting where the last one ends.
 *   '↖' '↗' '↙' '↘' diagonal stairs, pointing uphill, for a diagonal corridor: placed on the LOWER level on one of its floor
 *                   squares, with the corridor going on (on the level above) from the corner they point at. The diagonal tiles
 *                   beside them tilt with them, as you walk across those too. Those tiles sit on the lower level as well, and the
 *                   tiles above all of them must be empty.
 *   ':' open air inside a shaft: empty (you fall), but lit and seen through like floor, so the walls round the
 *                   shaft show along its whole height
 *   '◸' '◹' '◺' '◿' a diagonal rim: floor in the north-west, north-east, south-west or south-east half, open air in the
 *                   other (the diagonal edge of a hole)
 *   '▛' '▜' '▙' '▟' a diagonal wall in a shaft: wall in the north-west, north-east, south-west or south-east half, open air
 *                   in the other
 *   'H' ladder on the wall north of its tile, climbed in place. A ladder is one level tall; an 'H' at the
 *                   same tile on consecutive levels is one tall ladder. The tile north of its top is
 *                   floor on the level above (and wall on the levels of the ladder itself).
 * Walls grow on their own around every walkable tile, except over open space: if something
 * walkable lies below, the edge becomes a ledge you can see down from instead.
 *
 * The layout. Level 0: the waxed labyrinth, a short one-tile-wide ring round the shaft room at its
 * centre, with its corners cut by diagonal corridors; it starts at the start room in the north-west and
 * goes clockwise to the west corridor into the shaft room, which holds the Wax Blob and the foot of a
 * ladder up its north wall (levels 0 to 6). Level 7, Floor A: the Nave, a wide octagonal room round the
 * shaft hole, with a corridor through each corner wall going down a diagonal stair to the wheel on level 6:
 * four corner halls, a ring of links and four chapels, one level below the Nave.
 * Level 10, Floor B: the Gallery, side rooms joined by thin bridges across the open space above the Nave. Level 13, Floor C: the Sanctum, a small waxed-over platform in the middle of the open air above the Nave, reached by four bridges. Each floor is 3 levels above the one
 * below; the stairs from the wheel to Floor B take 4 steps (from the SE hall to the east room), those to Floor C 3. One level is one tile of height on screen (RISE in tuning.ts).
 *
 * A diagonal corridor is a run of floor squares touching corner to corner, with a diagonal tile on
 * each side of every step (floor toward the squares), so it is about a tile and a half wide.
 */

export const LEVEL_PLANS: string[][] = [
  // Level 0: the waxed labyrinth, a short ring round the shaft room, clockwise from the start room (north-west) to the west corridor; the shaft room at its centre (a Wax Blob, and the ladder on its north wall)
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        ...                         ",
    "                        ...                         ",
    "             .....       .                          ",
    "             .....       .                          ",
    "             ..@..............◣                     ",
    "             .....           ◥.◣                    ",
    "             .....            ◥.◣                   ",
    "                    .          ◥.   ..              ",
    "                    .    ◢H◣    ......              ",
    "                    .   ◢...◣   .   ..              ",
    "                    .............                   ",
    "                    .   ◥...◤   .                   ",
    "                    .    ◥.◤    .                   ",
    "                    .◣    .    ◢.                   ",
    "                    ◥.◣   .   ◢.◤                   ",
    "                     ◥.◣  .  ◢.◤                    ",
    "                      ◥.......◤                     ",
    "                        .                           ",
    "                        .                           ",
    "                       ###                          ",
    "                       ###                          ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 1: the shaft (walled all round, open air inside)
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        #####                       ",
    "                       ##▛H▜##                      ",
    "                       #▛:::▜#                      ",
    "                       #:::::#                      ",
    "                       #▙:::▟#                      ",
    "                       ##▙:▟##                      ",
    "                        #####                       ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        o                           ",
    "                       ...                          ",
    "                       ...                          ",
    "                        ..                          ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 2: the shaft
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        #####                       ",
    "                       ##▛H▜##                      ",
    "                       #▛:::▜#                      ",
    "                       #:::::#                      ",
    "                       #▙:::▟#                      ",
    "                       ##▙:▟##                      ",
    "                        #####                       ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        ::                          ",
    "                        ::                          ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 3: the shaft
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        #####                       ",
    "                       ##▛H▜##                      ",
    "                       #▛:::▜#                      ",
    "                       #:::::#                      ",
    "                       #▙:::▟#                      ",
    "                       ##▙:▟##                      ",
    "                        #####                       ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        ::                          ",
    "                        ::                          ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 4: the shaft
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                         ###                        ",
    "                       ###H#                        ",
    "                       ###.#                        ",
    "                      .....#                        ",
    "                      ..                            ",
    "                      .                             ",
    "                      .                             ",
    "             ..    . ..                             ",
    "             ..........                             ",
    "             ..   . .                               ",
    "             ..         #####                       ",
    "             ..        ##▛H▜##                      ",
    "             ..        #▛:::▜#                      ",
    "             ..        #:::::#                      ",
    "             ..        #▙:::▟#                      ",
    "             ..        ##▙:▟##                      ",
    "             ..         #####                       ",
    "             ..                                     ",
    "             ..                                     ",
    "             ..                                     ",
    "          .....##                                   ",
    "          .....H..                                  ",
    "          ........                                  ",
    "          .......  .    ::                          ",
    "          ..........◣   ::H..                       ",
    "                  ◥..◣  .....                       ",
    "                   ◥..◣ .....                       ",
    "                    ◥........                       ",
    "                     ..                             ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 5: the shaft
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                         ###                        ",
    "                       ###H#                        ",
    "                       #####                        ",
    "                         ###                        ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "             H:                                     ",
    "             ::                                     ",
    "             ::                                     ",
    "             ::         #####                       ",
    "             ::        ##▛H▜##                      ",
    "             ::        #▛:::▜#                      ",
    "             ::        #:::::#                      ",
    "             ::        #▙:::▟#                      ",
    "             ::        ##▙:▟##                      ",
    "             ::         #####                       ",
    "             ::                                     ",
    "             ::                                     ",
    "             ::                                     ",
    "          :::::##                                   ",
    "          :::::H::                                  ",
    "          ::::::::                                  ",
    "          :::::::                                   ",
    "          :::::::       ::H::                       ",
    "                        :::::                       ",
    "                        :::::                       ",
    "                        :::::                       ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 6: the shaft (the ladder's last rungs), and Floor A's outer wheel, a level below the Nave: four corner halls, a ring of links and four chapels; a diagonal stair up to the Nave in each corner corridor, and the stairs up from the SE hall
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                       #######                      ",
    "                       #wwwww#                      ",
    "                       #wwwww#                      ",
    "                       #wwHww#                      ",
    "          .......      #wwwww#      .......         ",
    "          .......      ###.###      .......         ",
    "          ......................>>ww.......         ",
    "          ......................>>ww.......         ",
    "          .......◣       #         w.......         ",
    "             :: ◥.◣               www ..            ",
    "             ::  ◥↘◣             www  ..            ",
    "             ::   ◥              ww   ..            ",
    "             ::         #####         ..            ",
    "      .....  ::        ##▛H▜##        ..  .....     ",
    "      .....  ::        #▛:::▜#        ..  .....     ",
    "      .......>>        #:::::#        .........     ",
    "      .....  ::        #▙:::▟#        ..  .....     ",
    "      .....  ::        ##▙:▟##        ..  .....     ",
    "             ::         #####         ..            ",
    "             ::   ◢               ◣   ..            ",
    "             ::  ◢↗◤             ◥↖◣  ..            ",
    "             :: ◢.◤               ◥.◣ ..            ",
    "          :::::..◤      #          ◥/....^.         ",
    "          ::::::::.........................         ",
    "          ::::::::.........................         ",
    "          :::::::         .         .......         ",
    "          :::::::       :::::       .......         ",
    "                        :::::                       ",
    "                        :::::                       ",
    "                        :::::                       ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 7: Floor A, the Nave: a wide octagonal room round the shaft hole; the corner corridors go down from it to the wheel on level 6
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                        .....                       ",
    "                        .....                       ",
    "                        .. ..                       ",
    "                        .....                       ",
    "                          :       ##                ",
    "                                  >>                ",
    "                                  >>                ",
    "                         #        #w                ",
    "                   ##◢.........◣  www               ",
    "                    ◢...........◣www                ",
    "                   ..............◣w                 ",
    "                  ◢...............◣                 ",
    "                  .......◸ ◹.......#                ",
    "                  ......◸   ◹......                 ",
    "               .........     ......                 ",
    "                  ......◺   ◿......                 ",
    "                  .......◺ ◿.......                 ",
    "                  ◥...............◤                 ",
    "                   ...............                  ",
    "                    ◥...........◤                   ",
    "                     ◥.........◤         ^          ",
    "                        #                           ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 8: stairs up from the SE hall (A to B); the Nave's walls and open air
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########   ◢                ",
    "                    #▛:::::::::▜# ◢.◤               ",
    "                   #▛:::::::::::▜◢.◤                ",
    "                  #::::::::::::::◹◤                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #:::::::::::::::#                 ",
    "                   #▙:::::::::::▟#       ^          ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########      oo            ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 9: stairs up from the SE hall (A to B); the Nave's walls and open air
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛::::::::::::::#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#      ^          ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 10: Floor B, the Gallery: side rooms joined by thin bridges across the open space above the Nave
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                       .......                      ",
    "                       .......            ......    ",
    "                       .......            ......    ",
    "                       .......            ......    ",
    "                       .......            ......    ",
    "                       .......            ......    ",
    "                     #####.#####          ......    ",
    "                    #▛::::.::::▜#         ......    ",
    "                   #▛:::::.:::::▜#          .       ",
    "                  #▛::::::.::::::▜#         .       ",
    "          .......#▛:::::::.:::::::▜#..........      ",
    "          .......#::::::::.::::::::#..........      ",
    "          .......#::::::::.::::::::#..........      ",
    "          ....................................      ",
    "          .......#::::::::.::::::::#..........      ",
    "          .......#::::::::.::::::::#..........      ",
    "          .◣.....#▙:::::::.:::::::▟#..........      ",
    "          ◥↘◣  ####▙::::::.::::::▟#                 ",
    "           ◥ w     #▙:::::.:::::▟#                  ",
    "            www    w#▙::::.::::▟#                   ",
    "             www  www#####.#####                    ",
    "              wwwwww   .......                      ",
    "               wwww    .......                      ",
    "                       .......                      ",
    "                       .......                      ",
    "                       .......                      ",
    "                       .......                      ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 11: stairs up from the W room (B to C); the Nave's walls and open air
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "            .◣     #▙:::::::::::▟#                  ",
    "            ◥↘◣    w#▙:::::::::▟#                   ",
    "             ◥ w  www###########                    ",
    "              wwwwww                                ",
    "               wwww                                 ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 12: stairs up from the W room (B to C); the Nave's walls and open air
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                   w#▙:::::::::▟#                   ",
    "              .◣  www###########                    ",
    "              ◥↘◣www                                ",
    "               ◥ ww                                 ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 13: Floor C, the Sanctum: the Nave's walls go on up round the open air, and a small waxed-over platform stands in the middle of it, reached by four bridges; the stairs from the W room arrive in the west wall.
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #◢:::::::::◣#                   ",
    "                   #◢.◺:::::::◿.◣#                  ",
    "                  #▛:◹.◺:::::◿.◸:▜#                 ",
    "                 #▛:::◹.......◸:::▜#                ",
    "                 #:::::.......:::::#                ",
    "                 #:::::.......:::::#                ",
    "                 #:::::.......:::::#                ",
    "                 #:::::.......:::::#                ",
    "                 #:::::.......:::::#                ",
    "                 #▙:::◿.......◺:::▟#                ",
    "                  #▙:◿.◸:::::◹.◺:▟#                 ",
    "                   #◢.◸:::::::◹.◤#                  ",
    "                   ◢.◤:::::::::◤#                   ",
    "                  ◢.◤###########                    ",
    "                 ◢.◤                                ",
    "                ..◤                                 ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 14: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #::::::::::::▟#                  ",
    "                    #::::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 15: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 16: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 17: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 18: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 19: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 20: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 21: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 22: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 23: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
  // Level 24: more of the Nave's walls round the open air above Floor C
  [
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                     ###########                    ",
    "                    #▛:::::::::▜#                   ",
    "                   #▛:::::::::::▜#                  ",
    "                  #▛:::::::::::::▜#                 ",
    "                 #▛:::::::::::::::▜#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "                 #:::::::::::::::::#                ",
    "              ↘  #:::::::::::::::::#                ",
    "               w #:::::::::::::::::#                ",
    "                 #▙:::::::::::::::▟#                ",
    "                  #▙:::::::::::::▟#                 ",
    "                   #▙:::::::::::▟#                  ",
    "                    #▙:::::::::▟#                   ",
    "                     ###########                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
    "                                                    ",
  ],
];

/**
 * Diagonal tiles (written as usual in the plans) that are wax: a wall of melted candle wax, painted
 * pale and smooth, not as brick. [level, x, y] in plan coordinates.
 */
export const WAX_TILES: [number, number, number][] = [
  [11, 13, 24], [12, 15, 26], // the second and third flights of the stairs to the third floor
  [11, 13, 23], [11, 12, 24], [11, 14, 24], [11, 13, 25], [12, 15, 25], [12, 14, 26], [12, 16, 26], [12, 15, 27], // and their flanks
  [8, 35, 11], [8, 34, 12], [8, 36, 12], [8, 33, 13], [8, 35, 13], [8, 34, 14], // the NE corridor, two levels up: its flanks are wax
  [6, 32, 9], [6, 33, 9], [6, 32, 10], [6, 33, 10], [7, 34, 9], [7, 35, 9], [7, 34, 10], [7, 35, 10], // the wax ramp up to the NE hall, from the north corridor: two runs, two blocks high
  [7, 33, 14], // in the Nave's NE door, on the Nave's wall line
];

/**
 * Where wax has run over the ground: [level, x0, y0, x1, y1, how thick] (plan coordinates, both corners
 * included; 1 is the whole floor waxed over, less is scattered splodges). Some are round the wax walls,
 * the raised north chapel is all wax, and a few are down in the mined tunnels for texture.
 */
export const WAX_SPLODGES: [number, number, number, number, number, number][] = [
  [7, 30, 12, 35, 16, 0.5], // round the wax wall in the Nave's NE door
  [7, 24, 4, 28, 7, 1], // the raised north chapel, filled with wax
  [13, 12, 11, 36, 30, 1], [8, 33, 11, 36, 14, 1], // the platform, its bridges and the long one from the stairs; the higher NE corridor
  [13, 23, 15, 29, 21, 1], // the waxed-over platform of Floor C
  [8, 36, 7, 42, 11, 1], [8, 38, 12, 39, 24, 1], [8, 40, 18, 41, 18, 1], [8, 42, 16, 46, 20, 1], // the raised NE hall, east corridor and east room
  [6, 31, 8, 36, 11, 0.6], // round the wax ramp
  [11, 12, 22, 14, 25, 1], [12, 13, 24, 16, 27, 1], // the waxed flights' floors and heads
  [1, 23, 26, 26, 30, 1], // the little room under the south chapel: floor all wax
  [0, 0, 0, 60, 40, 0.18], // the labyrinth
  [4, 10, 25, 16, 29, 0.3], [4, 13, 12, 14, 24, 0.3], [4, 15, 8, 24, 14, 0.3], // the dug-out SW hall, the west link, the tunnel to the north chapel
  [4, 17, 28, 24, 33, 0.3], [4, 24, 29, 28, 32, 0.35], // the tunnel to the south chapel, and the chapel dug out
];

/**
 * Wooden tiles: the planks and stairs of the bridge to the west chapel. [level, x, y] in plan coordinates.
 */
export const WOOD_TILES: [number, number, number][] = [
  [6, 13, 18], [6, 14, 18], // the stair over the dug link
  [7, 15, 18], [7, 16, 18], [7, 17, 18], // the planks to the Nave
];

/**
 * Where the stone has crumbled: [level, x0, y0, x1, y1, chance of rubble on a floor tile] (plan coordinates,
 * both corners included). On top of these, rubble falls by itself here and there across the dungeon,
 * thickly in the dug-out places and round the edge of every pit (`rubbleFor` in `world.ts`).
 */
export const RUBBLE_SPOTS: [number, number, number, number, number, number][] = [
  [7, 14, 17, 21, 19, 0.7], // the hole broken through the Nave's west wall, and the bridge
  [7, 24, 4, 28, 7, 0.5], // round the hole in the wax
  [6, 10, 7, 16, 11, 0.12], // the NW hall, above the pit
];

/**
 * Where walls are rock (the mined tunnels and dug-out places) rather than brick: [first level, last level,
 * x0, y0, x1, y1] in plan coordinates, both corners included. A wall's look is its own, placed here, and not
 * taken from the floor beside it or the level it is on; a cliff over ground inside a zone is rock too.
 */
export const ROCK_ZONES: [number, number, number, number, number, number][] = [
  [4, 5, 12, 11, 15, 25], [6, 6, 15, 11, 15, 25], [6, 6, 12, 11, 12, 15], [6, 6, 12, 21, 12, 25], // the west link, dug out
  [4, 6, 9, 24, 16, 30], [4, 5, 17, 24, 17, 30], // the SW hall, dug out
  [4, 5, 16, 27, 24, 34], // the tunnel to the south chapel
  [4, 5, 23, 28, 29, 34], [6, 6, 23, 29, 29, 34], // the south chapel, dug out
  [4, 5, 14, 5, 27, 14], // the tunnel east, and the stub under the wax
];

/**
 * Blocks of wax that fill a place some levels high: [x0, y0, x1, y1, height] in plan coordinates, both corners included. Every floor tile of
 * level 6 inside becomes a solid wax wall (as many levels as the height), with its floor on the level above them, and the walls that stood round it stay.
 */
export const RAISED_WAX: [number, number, number, number, number][] = [
  [36, 7, 42, 11, 2], // the NE hall
  [38, 12, 39, 24, 2], // the east corridor, which ends in a drop onto the SE hall
  [40, 18, 41, 18, 2], [42, 16, 46, 20, 2], // the east room, and the way to it
];

/**
 * Floors that are one block thick however much open air lies under them, like a bridge: [level, x0, y0, x1, y1] in plan coordinates.
 * Their cliffs are a single block, not a column down to the ground.
 */
export const THIN_FLOORS: [number, number, number, number, number][] = [
  [13, 17, 11, 35, 25], // the platform of Floor C and its bridges
];

/**
 * Tiles cut off from every neighbour on their level, so each is a place of its own with a line on every side where a
 * room meets it: the foot of a ladder, the first step of a stair. [level, x, y] in plan coordinates. (Lines otherwise come
 * from where rooms meet, and at the ends of ladders and stairs; this adds some by hand.)
 */
/**
 * Boxes whose walls are all wax: [first level, last level, x0, y0, x1, y1] in plan coordinates. (The walls of the 2x2 hole from the
 * south chapel and of the little room under it, which is waxed over too.) A wall with a ladder in front of it is left as it is.
 */
export const WAX_WALLS: [number, number, number, number, number, number][] = [
  [1, 3, 22, 25, 27, 31], // the little room and the hole above it
  [4, 4, 23, 27, 26, 29], // the hole where it opens in the south chapel's floor
  [6, 9, 35, 6, 43, 12], [6, 9, 37, 11, 40, 24], [6, 9, 39, 15, 47, 21], // the walls round the wax-filled NE hall, east corridor and east room
];

/**
 * Tiles that count as open space of the room beside them even where they are too narrow to (so no separator line cuts them off):
 * [level, x, y] in plan coordinates.
 */
export const OPEN_TILES: [number, number, number][] = [
];

/**
 * Tiles that count as part of a thin passage (a corridor one tile wide) though a hall's open air lies beside them: [level, x, y] in
 * plan coordinates. (The first square of the NE corridor, whose flanks and door then belong to the corridor, the line between it and the Nave on the door's wall line.)
 */
export const PASSAGE_TILES: [number, number, number][] = [];

/**
 * Tiles set into the room of another by hand: [level, x, y, reference x, reference y] on the same level, plan coordinates.
 * (The flanks and last square of the NE corridor, which the Nave's open air would otherwise take: the separator line then runs
 * across the door's cell, on the Nave's wall line, as at the other doors. And the odd tiles of air over the flanks of a stair, which
 * would make short straight lines of their own.)
 */
export const ROOM_FOLLOWS: [number, number, number, number, number][] = [
  [8, 34, 13, 35, 12], [8, 33, 13, 35, 12], [8, 34, 14, 35, 12],
  [13, 21, 12, 21, 13], [13, 22, 12, 22, 13], [13, 23, 12, 23, 13], [13, 29, 12, 29, 13], [13, 30, 12, 30, 13], [13, 31, 12, 31, 13], [13, 20, 13, 21, 13], [13, 19, 14, 19, 15], [13, 20, 14, 20, 15], [13, 32, 13, 31, 13], [13, 32, 14, 32, 15], [13, 33, 14, 33, 15], [13, 19, 22, 19, 21], [13, 32, 22, 32, 21], [13, 33, 22, 33, 21], [13, 32, 23, 31, 23], [13, 23, 24, 23, 23], [13, 29, 24, 29, 23], [13, 30, 24, 30, 23], [13, 31, 24, 31, 23], // the pockets of air between the third floor's bridges and the ring's wall go with the room round the platform
  [11, 11, 23, 11, 22], [12, 14, 24, 13, 24], [12, 13, 25, 13, 24], [13, 16, 26, 15, 26], [13, 15, 27, 15, 26], // the odd tiles of air over the flanks of the stairs to the third floor, with the air over the stair beside them
];

/**
 * Pairs of tiles whose rooms are one room by hand: [level, x, y, level, x, y] in plan coordinates. (The hole in the south
 * chapel's floor, the room under it and the chapel: all one room, lit together, with no separator line anywhere in it.)
 */
export const JOIN_TILES: [number, number, number, number, number, number][] = [
  [4, 24, 28, 3, 24, 28], [4, 24, 28, 4, 24, 29],
];

/**
 * Tiles that count as open air above the room under them, for what the room covers (a walled room hides what lies north of
 * its north wall, column by column): [level, x, y] in plan coordinates. (The rim of the Nave's NE door, whose column would
 * otherwise be covered all the way up.)
 */
export const OPEN_ABOVE: [number, number, number][] = [
  [8, 33, 14],
];

/**
 * Places where the walls above you are not drawn: [level you stand on, x0, y0, x1, y1 (where you stand), then x0, y0, x1, y1 (the
 * walls hidden, on every level above you)] in plan coordinates. (The little room under the south chapel: the walls of the hole
 * above it would be drawn over its floor.)
 */
export const HIDE_WALLS_ABOVE: [number, number, number, number, number, number, number, number, number][] = [
  [1, 22, 26, 26, 30, 22, 26, 30, 34],
];

/**
 * Zones [level, x0, y0, x1, y1] (plan coordinates) where every empty cell beside a floor's edge becomes a wall of wax, even where the
 * ordinary rule leaves it open (it leaves open the cells by a hole's rim and a stair, which is how a corridor's corners and heads
 * had gaps you could drop through). The cells right over a stair stay open. (The wax-filled corridor to Floor C's bridge.)
 */
export const FENCED_ZONES: [number, number, number, number, number][] = [
  [13, 12, 22, 21, 31],
];

export const ISOLATED_TILES: [number, number, number][] = [
  [6, 41, 25], // the foot of the stairs up from the SE hall
];

/**
 * Floors that are grates, coated in wax: you see through their holes to what lies below. [level, x0, y0, x1, y1] in plan coordinates.
 */
export const GRATE_ZONES: [number, number, number, number, number][] = [
  // (None just now: the platform of Floor C is solid wax again.)
];

/**
 * Pitch-black walls: [first level, last level, x0, y0, x1, y1] in plan coordinates. Every empty cell in the box becomes a wall that is
 * painted solid black and always shows (like the other walls it is not drawn when you are below it and outside a walled room): a
 * curtain to cover what should not be seen.
 */
export const BLACK_WALLS: [number, number, number, number, number, number][] = [
  [7, 9, 9, 0, 17, 16], // beyond the main room's west edge (its west wall is at x=17), starting on the row above the plank corridor's north wall (row 17) and going up to the top of the map, as far left as the NW hall and as far right as the corridor's mouth: nothing of the room lies under it
];
