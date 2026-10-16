import { Text, View } from 'react-native';

import { CarromBoard } from '@/components/carrom-board';
import { CarromState, sideOf, teamColor } from '@/games/carrom/engine';
import { makeStyles } from '@/ui/theme';

import type { GameUI } from './types';

const queenText = (state: CarromState) =>
  state.queen === 'board'
    ? 'Queen on the board'
    : 'pendingSeat' in state.queen
      ? 'Queen waiting to be covered'
      : `Queen won by ${teamColor(state.queen.coveredBy)}`;

const teamName = (state: CarromState, team: number) =>
  state.seats.length === 2
    ? (state.seats[team]?.name ?? teamColor(team))
    : `Team ${teamColor(team) === 'white' ? 'White' : 'Black'}`;

export const carromUI: GameUI<CarromState> = {
  shape: 'square',
  Board: ({ state, size, mySeats, act }) => {
    // Each player sees their own side at the bottom; a shared device keeps seat 0's view.
    const viewerSide = mySeats.length === 1 ? sideOf(mySeats[0], state.seats.length) : 0;
    return (
      <CarromBoard
        state={state}
        size={size}
        viewerSide={viewerSide}
        canShoot={!state.over && mySeats.includes(state.turn)}
        onShoot={(move) => act(state.turn, move)}
      />
    );
  },
  Controls: ({ state }) => {
    const styles = useStyles();
    return (
      <View style={styles.score}>
        <Text style={styles.scoreLine}>⚪ {state.pocketed.white}/9</Text>
        <Text style={styles.scoreLine}>⚫ {state.pocketed.black}/9</Text>
        <Text style={styles.queen}>{queenText(state)}</Text>
      </View>
    );
  },
  status: (state) => state.last?.message ?? 'Break the centre to start. Pocket your colour, then cover the queen.',
  hint: () => 'Aim, set power, then Strike',
  detail(state, seat) {
    const color = teamColor(state.teams[seat]);
    return `${color === 'white' ? '⚪' : '⚫'} ${state.pocketed[color]}/9`;
  },
  result: (state, room) =>
    state.winnerTeam == null
      ? 'Game over'
      : `${state.seats.length === 2 ? room.seats[state.winnerTeam]?.name : teamName(state, state.winnerTeam)} wins! +${state.points} points`,
};

const useStyles = makeStyles((colors) => ({
  score: { minWidth: 90, gap: 2 },
  scoreLine: { color: colors.text, fontSize: 16, fontWeight: '800' },
  queen: { color: '#F87171', fontSize: 12, fontWeight: '700' },
}));
