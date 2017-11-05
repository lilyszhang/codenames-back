import * as _ from 'lodash'
import { Clue } from './Clue';
import { Board } from './Board';
import { SPlayer } from './SPlayer';
import { SOperative } from './SOperative';
import { SSpymaster } from './SSpymaster';
import { SLoiterer } from './SLoiterer';
import { Broadcaster } from './Broadcaster';
import { Team, Turn } from '../constants/Constants';
import { RuleEnforcer } from './RuleEnforcer';

export class Game {
	score: number[];
	clue?: Clue;
	numGuesses: number;
	turn: Turn;
	board: Board;
	players: SPlayer[];
	loiterers: SLoiterer[];
	startTeam: Team;
	currTeam: Team;

  constructor() {
    this.numGuesses = 0;
		this.loiterers = [];
		this.players = [];
  }

	broadcastUpdatedBoard() {
		var spymasters = this.findSpymasters();
    var operatives = this.findOperatives();

		Broadcaster.updateBoard(operatives, this.board.cards.map((card, index) => {
				return [card, card.revealed ? this.board.colors[index] : 4]
    }));
		Broadcaster.updateBoard(spymasters, this.board);
	}

	getSloitererTeams(sloiterers: SLoiterer[]): [SLoiterer[], SLoiterer[]] {
		return [Team.red, Team.blue].map((teamColor) => {
			return sloiterers.filter((loiterer) => {
				return loiterer.team === teamColor;
			});
			// Typescript compiler doesn't understand mapping over Tuple can return tuple
		}) as [SLoiterer[], SLoiterer[]];
	}

	getPlayerTeams(players: SPlayer[]): [SPlayer[], SPlayer[]] {
		return [Team.red, Team.blue].map((teamColor) => {
			return players.filter((player) => {
				return player.team === teamColor;
			});
			// Typescript compiler doesn't understand mapping over Tuple can return tuple
		}) as [SPlayer[], SPlayer[]];
	}

	// TODO: testing
	// create roster of blue and red teams
	getRoster(players) { //: [SPlayer[], SPlayer[]] {	
		const redTeam = players.filter(person => person.team === Team.red)
    const blueTeam = players.filter(person => person.team === Team.blue)
		return [blueTeam, redTeam];
	}

	getSloitererRoster(sloiterers: SLoiterer[]): [string[], string[]] {
		return this.getSloitererTeams(sloiterers).map((sloitererTeam) => {
			return sloitererTeam.map((sloiterer: SLoiterer) => {
				return sloiterer.name;
			})
			// TSC I promise you this is valid
		}) as [string[], string[]];
	}

	getPlayerRoster(players: SPlayer[]): [string[], string[]] {
		return this.getPlayerTeams(players).map((playerTeam) => {
			return playerTeam.map((player: SPlayer) => {
				return player.name;
			})
			// TSC I promise you this is valid
		}) as [string[], string[]];
	}

	// adds new loiterer to play class
  registerLoiterer(name, socket) {
    let sloitererTeams: [SLoiterer[], SLoiterer[]] = this.getSloitererTeams(this.loiterers);
    let team: Team = sloitererTeams[0].length <= sloitererTeams[1].length ? Team.blue : Team.red;
		let id = Date.now().toString(36);

    let newLoiterer = new SLoiterer(name, id, team, socket);
    this.loiterers.push(newLoiterer);
    let sloitererRoster = this.getSloitererRoster(this.loiterers);

		Broadcaster.updateTeams(this.loiterers, sloitererRoster);
		Broadcaster.updateLoiterer(newLoiterer);
		if (RuleEnforcer.canStartGame(sloitererRoster)) {
			Broadcaster.toggleStartButton(this.loiterers, true);
		}
  }

	// switches loiterer team
	switchLoitererTeam(id) {
		for (var i = 0; i < this.loiterers.length; i++) {
			if (this.loiterers[i].id === id) {
				var team = this.loiterers[i].team
				team = (team + 1) % 2;
				this.loiterers[i].team = team;
			}
    }

		let sloitererRoster = this.getSloitererRoster(this.loiterers);

		Broadcaster.updateTeams(this.loiterers, sloitererRoster);
		if (RuleEnforcer.canStartGame(sloitererRoster)) {
			Broadcaster.toggleStartButton(this.loiterers, true);
		}
    else {
      Broadcaster.toggleStartButton(this.loiterers, false);
    }
	}

	// on socket close, remove person
	removePerson(socket) {
		var index = -1
		let roster: [string[], string[]];

		if (this.players.length == 0) {
			for (var i = 0; i < this.loiterers.length; i++) {
				if (_.isEqual(this.loiterers[i].socket, socket)) {
					index = i;
				}
			}
			if (index > -1) {
				this.loiterers.splice(index, 1);
			}
			roster = this.getSloitererRoster(this.loiterers);
			Broadcaster.updateTeams(this.loiterers, roster);
		}
		else {
			for (var i = 0; i < this.players.length; i++) {
				if (_.isEqual(this.players[i].socket, socket)) {
					index = i;
				}
			}
			if (index > -1) {
				this.players.splice(index, 1);
			}
			roster = this.getPlayerRoster(this.players);
			Broadcaster.updateTeams(this.players, roster);
		}

		if (!RuleEnforcer.canStartGame(roster)) {
			Broadcaster.toggleStartButton(this.loiterers, false);
		}
	}

	// start button clicked -- set up game!
	startGame() {
  	this.setPlayerRoles();
  	this.setStartTeam();
    this.board = new Board(this.startTeam);
		this.currTeam = this.startTeam;
		this.score = [8,8];
		this.score[this.startTeam] = 9;
  	this.turn = Turn.spy;
		Broadcaster.updateScore(this.players, this.score);
		this.broadcastUpdatedBoard();
		var spymasters = this.findSpymasters();
		Broadcaster.promptForClue(spymasters[this.startTeam]);
  }

	// turn loiterers into players
	setPlayerRoles() {
		var foundSpy = [false, false];
		for (var loiterer of this.loiterers) {
			if (foundSpy[loiterer.team]) {
				var operative = new SOperative(loiterer.name, loiterer.id, loiterer.team, loiterer.socket, Turn.op);
				this.players.push(operative);
				Broadcaster.updateLoitererToPlayer(loiterer, operative);
			}
			else {
				var spy= new SSpymaster(loiterer.name, loiterer.id, loiterer.team, loiterer.socket, Turn.spy);
				this.players.push(spy);
				Broadcaster.updateLoitererToPlayer(loiterer, spy);
				foundSpy[loiterer.team] = true;
			}
		}
		this.loiterers = [];
  }

	findSpymasters(): SSpymaster[] {
		var spymasters = new Array<SSpymaster>(2);
		var playerTeams = this.getPlayerTeams(this.players)
		var players = playerTeams[0].concat(playerTeams[1]);
		for (var player of players) {
			if (player.role === Turn.spy) {
				spymasters[player.team] = player;
			}
    }
    return spymasters;
	}

	findOperatives(): SOperative[] {
    return this.players.filter((player) => { player.role === Turn.op }) as SOperative[];
	}

	getPlayerById(id: string): SPlayer {
    // TODO: REALLLLLLLLY SHOULDNT CAST LIKE THIS
    return this.players.find((player) => { return player.id === id; }) as SPlayer;
	}

  setStartTeam(): void {
  	this.startTeam = Math.round(Math.random()) ? Team.red : Team.blue ;
  }

  // set the clue and the initial number of guesses for operatives, switch turn to operatives
  initializeClue(clue): void {
    this.clue = clue;
    this.numGuesses = clue.num + 1;
		Broadcaster.postClue(this.players, this.clue as Clue, this.currTeam);
		this.turn = Turn.op;
		Broadcaster.switchTurn(this.players, this.currTeam, this.turn);
  }

	selectCard(player, cardIndex): void {
		player.selectCard(this.board.cards[cardIndex]);
		this.board.cards[cardIndex].votes.push(player.id);
		this.broadcastUpdatedBoard();
	}

	deselectCard(player, cardIndex): void {
		var playerIndex = this.board.cards[cardIndex].votes.indexOf(player.id);
		this.board.cards[cardIndex].votes.splice(playerIndex, 1);
		this.broadcastUpdatedBoard();
	}

  // decrease number of guesses
  decrementGuesses(): void {
    this.numGuesses--;
		if (this.numGuesses == 0) {
			this.switchActiveTeam();
		}
		Broadcaster.updateNumGuesses(this.players, this.numGuesses);
  }

	checkGuess(guessIndex): void {
		this.revealCard(guessIndex);
		if (this.board.colors[guessIndex] === this.currTeam) { //correct guess
			this.decrementGuesses();
			this.updateScore(this.currTeam);
		}
		else if (this.board.colors[guessIndex] == 3) { //assassin
			this.endGame(((this.currTeam as Team) + 1) % 2);
		}
		else if (this.board.colors[guessIndex] == 2) { //neutral
			this.switchActiveTeam();
		}
		else { // opposite team card
			this.switchActiveTeam();
			this.updateScore(((this.currTeam as Team) + 1) % 2);
		}
		Broadcaster.updateBoard(this.players, this.board);
	}

	switchActiveTeam(): void {
    this.currTeam = this.currTeam === Team.red ? Team.blue : Team.red;
		this.turn = Turn.spy;
		var spymasters = this.findSpymasters();
		Broadcaster.promptForClue(spymasters[this.currTeam]);
		Broadcaster.switchActiveTeam(this.players, this.currTeam, this.turn);
	}

  // update this.score
  updateScore(team): void {
		this.score[team]--;
		if (this.score[team] == 0) {
			this.endGame(team);
		}
		Broadcaster.updateScore(this.players, this.score);
  }

	revealCard(guessIndex): void {
		this.board.cards[guessIndex].revealed = true;
		this.broadcastUpdatedBoard();
	}

	endGame(team): void {
		Broadcaster.endGame(this.players, team);
	}
}
