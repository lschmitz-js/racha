import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'en' | 'pt';

const STORAGE_KEY = 'racha.lang';

const dict = {
  en: {
    // global
    'common.loading': 'Loading…',
    'common.notFound': 'Not found.',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.close': 'Close',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.new': '+ New',
    'common.clear': 'Clear',
    'common.back': '← Back',
    'common.home': '← Home',
    'common.session': '← Session',

    // nav
    'nav.home': 'Home',
    'nav.players': 'Players',
    'nav.recap': 'Stats',

    // status
    'status.draft': 'draft',
    'status.live': 'live',
    'status.done': 'done',
    'status.pending': 'pending',
    'status.running': 'running',
    'status.paused': 'paused',

    // home
    'home.title': 'Racha de Segunda',
    'home.welcome': 'Welcome to Racha!',
    'home.startRacha': 'Start Racha',
    'home.activeSession': 'Active session',
    'home.open': 'Open →',
    'home.lineup': "Tonight's lineup",
    'home.selected': '{n} selected',
    'home.seasonPlayers': 'Season players',
    'home.dropins': 'Drop-ins',
    'home.selectMore': 'Select {n} more',
    'home.startSession': 'Start session →',
    'home.pastSessions': 'Past sessions',

    // who is here
    'lineup.title': 'Who is here?',
    'lineup.subtitle': 'Tap everyone who is playing tonight.',
    'lineup.needMore': 'Need {n} more',
    'lineup.start': 'Start session →',
    'lineup.cancel': '← Cancel',

    // session
    'session.endSession': 'End session',
    'session.confirmDelete':
      'Delete this session? All its matches and events will be permanently removed.',
    'session.drawPrompt': '{n} players selected. Draw to balance into 3 teams.',
    'session.balanced': 'Balanced',
    'session.dropinSplit': 'Drop-in split',
    'session.teams': 'Teams',
    'session.redraw': 'Redraw (balanced)',
    'session.liveMatchNotice':
      'Match {n} is still {status}. Finish it before starting a new one.',
    'session.resumeMatch': 'Resume match {n}',
    'session.pickPrompt': 'Pick which two teams play next. The third benches.',
    'session.startMatch': 'Start match {n}',
    'session.pickTwo': 'Pick two teams above',
    'session.matchesTonight': 'Matches tonight',
    'session.matchN': 'Match {n}',
    'session.endedNotice': 'This session has ended. No more matches can be started.',
    'session.dangerZone': 'Danger zone',
    'session.confirmEnd': 'End this session? You will not be able to start more matches.',

    // teamcard
    'team.playersCount': '{n} players',
    'team.onPitchA': 'On pitch (A)',
    'team.onPitchB': 'On pitch (B)',
    'team.pickToPlay': 'Pick to play',
    'team.add': '+ Add',
    'team.removeAria': 'Remove {name}',
    'team.addTitle': 'Add to {vest}',
    'team.noneAvailable': 'No players available.',
    'team.moveFrom': 'move from {vest}',
    'team.notInSession': 'not in session',

    // match
    'match.start': 'Start',
    'match.pause': 'Pause',
    'match.resume': 'Resume',
    'match.end': 'End',
    'match.muteSound': 'Mute sounds',
    'match.unmuteSound': 'Unmute sounds',
    'match.selected': 'Selected: {name}',
    'match.sub': 'Sub',
    'match.over': 'Match over — {a} : {b}. Who stays?',
    'match.backToSession': 'Back to session',
    'match.undo': 'Undo',
    'match.assistHint': '{name} ⚽ — tap a teammate for assist?',
    'match.armedHint': 'Tap the player who did it.',
    'match.events': 'Events',
    'match.noEvents': 'No events yet.',
    'match.draw': 'Draw',
    'match.vestStays': '{vest} stays',
    'match.vestSits': '{vest} sits',
    'match.pickBench': 'Pick who benches next.',
    'match.startNext': 'Start next match ({vest} comes on)',

    // events
    'event.goal': 'Goal',
    'event.assist': 'Assist',
    'event.beautiful': 'Beautiful play',
    'event.bad': 'Howler',
    'event.save': 'Save',
    'event.caneta': 'Nutmeg',
    'event.quasegol': 'Open miss',

    // sub sheet
    'sub.title': 'Bench & subs',
    'sub.hint': 'Tap a player, then tap a vest to move them.',
    'sub.playingA': 'Playing — {vest}',
    'sub.playingB': 'Playing — {vest}',
    'sub.bench': 'Bench',
    'sub.benchEmpty': 'Nobody on the bench.',
    'sub.moveTo': 'Move to {vest}',
    'sub.pickPlayer': 'Pick a player first',
    'sub.off': 'Off',
    'sub.on': 'On',
    'sub.ownBench': '{vest} bench',
    'sub.benchTeam': '{vest} (benched team)',
    'sub.confirm': 'Confirm sub',
    'sub.confirmAdd': 'Add player',
    'sub.optional': 'optional',

    // recap (now: stats)
    'recap.title': 'Stats',
    'recap.leaderboard': 'Leaderboard',
    'recap.player': 'Player',
    'recap.pts': 'Pts',
    'recap.matchesShort': 'M',
    'recap.sessionsShort': 'S',
    'recap.weeks': 'Weeks',
    'recap.matchesGoals': '{m} matches · {g} goals',
    'recap.bestOfSeason': 'Best of the season',
    'recap.bestOfDay': 'Best of the day',
    'recap.noStats': 'No stats yet.',
    'recap.cat.mvp': 'MVP',
    'recap.cat.goals': 'Top scorer',
    'recap.cat.assists': 'Top playmaker',
    'recap.cat.beautiful': 'Most beautiful',
    'recap.cat.bad': 'Most howlers',
    'recap.cat.saves': 'Most saves',
    'recap.cat.canetas': 'Most nutmegs',
    'recap.cat.quasegols': 'Most open misses',

    // playerdb
    'players.title': 'Players',
    'players.confirmRemove': 'Remove {name}?',
    'players.imported': 'Imported {n} players.',
    'players.importFailed': 'Import failed: {msg}',
    'players.editTitle': 'Edit player',
    'players.newTitle': 'New player',
    'players.namePlaceholder': 'Name',
    'players.season': 'Season',
    'players.dropin': 'Drop-in',
    'players.player': 'Player',
    'players.gk': 'Goalkeeper',
    'players.avg': 'avg {n}',
    'players.changePhoto': 'Change photo',
    'players.removePhoto': 'Remove photo',

    // vests
    'vest.white': 'White',
    'vest.black': 'Black',
    'vest.green': 'Green',

    // skills
    'skill.Speed': 'Speed',
    'skill.Position': 'Position',
    'skill.Stamina': 'Stamina',
    'skill.Teamwork': 'Teamwork',
    'skill.Passing': 'Passing',
    'skill.Shooting': 'Shooting',
    'skill.Defend': 'Defend',
    'skill.Dribble': 'Dribble',

    // auth
    'auth.signIn': 'Sign in',
    'auth.signOut': 'Sign out',
    'auth.adminMode': 'Admin mode',
    'auth.password': 'Password',
    'auth.passwordPlaceholder': 'Admin password',
    'auth.signedIn': 'Signed in',
    'auth.wrongPassword': 'Wrong password.',
    'auth.adminOnly': 'Admin only — sign in to enable.',
  },
  pt: {
    // global
    'common.loading': 'Carregando…',
    'common.notFound': 'Não encontrado.',
    'common.cancel': 'Cancelar',
    'common.save': 'Salvar',
    'common.saving': 'Salvando…',
    'common.edit': 'Editar',
    'common.delete': 'Apagar',
    'common.close': 'Fechar',
    'common.export': 'Exportar',
    'common.import': 'Importar',
    'common.new': '+ Novo',
    'common.clear': 'Limpar',
    'common.back': '← Voltar',
    'common.home': '← Início',
    'common.session': '← Sessão',

    // nav
    'nav.home': 'Início',
    'nav.players': 'Jogadores',
    'nav.recap': 'Estatísticas',

    // status
    'status.draft': 'rascunho',
    'status.live': 'ao vivo',
    'status.done': 'finalizado',
    'status.pending': 'aguardando',
    'status.running': 'em andamento',
    'status.paused': 'pausado',

    // home
    'home.title': 'Racha de Segunda',
    'home.welcome': 'Bem-vindo ao Racha!',
    'home.startRacha': 'Começar Racha',
    'home.activeSession': 'Sessão ativa',
    'home.open': 'Abrir →',
    'home.lineup': 'Lista de hoje',
    'home.selected': '{n} selecionado(s)',
    'home.seasonPlayers': 'Jogadores fixos',
    'home.dropins': 'Avulsos',
    'home.selectMore': 'Selecione mais {n}',
    'home.startSession': 'Iniciar sessão →',
    'home.pastSessions': 'Sessões anteriores',

    // who is here
    'lineup.title': 'Quem veio?',
    'lineup.subtitle': 'Toque em todos que vão jogar hoje.',
    'lineup.needMore': 'Faltam {n}',
    'lineup.start': 'Iniciar sessão →',
    'lineup.cancel': '← Cancelar',

    // session
    'session.endSession': 'Encerrar sessão',
    'session.confirmDelete':
      'Apagar esta sessão? Todos os jogos e eventos serão removidos permanentemente.',
    'session.drawPrompt':
      '{n} jogadores selecionados. Sortear para balancear em 3 times.',
    'session.balanced': 'Balanceado',
    'session.dropinSplit': 'Avulsos separados',
    'session.teams': 'Times',
    'session.redraw': 'Sortear de novo (balanceado)',
    'session.liveMatchNotice':
      'O jogo {n} ainda está {status}. Termine antes de começar outro.',
    'session.resumeMatch': 'Continuar jogo {n}',
    'session.pickPrompt': 'Escolha os dois times que jogam. O terceiro fica fora.',
    'session.startMatch': 'Começar jogo {n}',
    'session.pickTwo': 'Escolha dois times acima',
    'session.matchesTonight': 'Jogos de hoje',
    'session.matchN': 'Jogo {n}',
    'session.endedNotice': 'Esta sessão foi encerrada. Não é possível iniciar mais jogos.',
    'session.dangerZone': 'Zona de perigo',
    'session.confirmEnd': 'Encerrar esta sessão? Não será possível iniciar mais jogos.',

    // teamcard
    'team.playersCount': '{n} jogadores',
    'team.onPitchA': 'Em quadra (A)',
    'team.onPitchB': 'Em quadra (B)',
    'team.pickToPlay': 'Escolher para jogar',
    'team.add': '+ Adicionar',
    'team.removeAria': 'Remover {name}',
    'team.addTitle': 'Adicionar ao {vest}',
    'team.noneAvailable': 'Nenhum jogador disponível.',
    'team.moveFrom': 'mover do {vest}',
    'team.notInSession': 'fora da sessão',

    // match
    'match.start': 'Iniciar',
    'match.pause': 'Pausar',
    'match.resume': 'Continuar',
    'match.end': 'Finalizar',
    'match.muteSound': 'Silenciar sons',
    'match.unmuteSound': 'Ativar sons',
    'match.selected': 'Selecionado: {name}',
    'match.sub': 'Sub',
    'match.over': 'Fim do jogo — {a} : {b}. Quem fica?',
    'match.backToSession': 'Voltar à sessão',
    'match.undo': 'Desfazer',
    'match.assistHint': '{name} ⚽ — toque em um colega para assistência?',
    'match.armedHint': 'Toque no jogador que fez.',
    'match.events': 'Eventos',
    'match.noEvents': 'Nenhum evento ainda.',
    'match.draw': 'Empate',
    'match.vestStays': '{vest} fica',
    'match.vestSits': '{vest} sai',
    'match.pickBench': 'Escolha quem fica de fora.',
    'match.startNext': 'Começar próximo ({vest} entra)',

    // events
    'event.goal': 'Gol',
    'event.assist': 'Assist.',
    'event.beautiful': 'Jogada bonita',
    'event.bad': 'Cagada',
    'event.save': 'Defesa',
    'event.caneta': 'Caneta',
    'event.quasegol': 'Perdeu na cara',

    // sub sheet
    'sub.title': 'Banco & subs',
    'sub.hint': 'Toque num jogador e depois numa cor pra trocar de time.',
    'sub.playingA': 'Em quadra — {vest}',
    'sub.playingB': 'Em quadra — {vest}',
    'sub.bench': 'Banco',
    'sub.benchEmpty': 'Ninguém no banco.',
    'sub.moveTo': 'Mover para {vest}',
    'sub.pickPlayer': 'Escolha um jogador primeiro',
    'sub.off': 'Sai',
    'sub.on': 'Entra',
    'sub.ownBench': 'Banco do {vest}',
    'sub.benchTeam': '{vest} (time fora)',
    'sub.confirm': 'Confirmar sub',
    'sub.confirmAdd': 'Adicionar jogador',
    'sub.optional': 'opcional',

    // recap (now: stats)
    'recap.title': 'Estatísticas',
    'recap.leaderboard': 'Ranking',
    'recap.player': 'Jogador',
    'recap.pts': 'Pts',
    'recap.matchesShort': 'J',
    'recap.sessionsShort': 'R',
    'recap.weeks': 'Semanas',
    'recap.matchesGoals': '{m} jogos · {g} gols',
    'recap.bestOfSeason': 'Melhores da temporada',
    'recap.bestOfDay': 'Melhor da rodada',
    'recap.noStats': 'Sem estatísticas ainda.',
    'recap.cat.mvp': 'Melhor em campo',
    'recap.cat.goals': 'Artilheiro',
    'recap.cat.assists': 'Garçom',
    'recap.cat.beautiful': 'Jogada bonita',
    'recap.cat.bad': 'Cagada',
    'recap.cat.saves': 'Defesas',
    'recap.cat.canetas': 'Mais canetas',
    'recap.cat.quasegols': 'Mais perdidas na cara',

    // playerdb
    'players.title': 'Jogadores',
    'players.confirmRemove': 'Remover {name}?',
    'players.imported': '{n} jogadores importados.',
    'players.importFailed': 'Falha ao importar: {msg}',
    'players.editTitle': 'Editar jogador',
    'players.newTitle': 'Novo jogador',
    'players.namePlaceholder': 'Nome',
    'players.season': 'Fixo',
    'players.dropin': 'Avulso',
    'players.player': 'Jogador',
    'players.gk': 'Goleiro',
    'players.avg': 'média {n}',
    'players.changePhoto': 'Mudar foto',
    'players.removePhoto': 'Remover foto',

    // vests
    'vest.white': 'Branco',
    'vest.black': 'Preto',
    'vest.green': 'Verde',

    // skills
    'skill.Speed': 'Velocidade',
    'skill.Position': 'Posicionamento',
    'skill.Stamina': 'Fôlego',
    'skill.Teamwork': 'Coletivo',
    'skill.Passing': 'Passe',
    'skill.Shooting': 'Chute',
    'skill.Defend': 'Defesa',
    'skill.Dribble': 'Drible',

    // auth
    'auth.signIn': 'Entrar',
    'auth.signOut': 'Sair',
    'auth.adminMode': 'Modo admin',
    'auth.password': 'Senha',
    'auth.passwordPlaceholder': 'Senha de admin',
    'auth.signedIn': 'Conectado',
    'auth.wrongPassword': 'Senha incorreta.',
    'auth.adminOnly': 'Apenas admin — entre para ativar.',
  },
} as const;

type Key = keyof (typeof dict)['en'];

interface I18nContext {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nContext | null>(null);

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
    const nav = window.navigator.language?.toLowerCase() ?? '';
    return nav.startsWith('pt') ? 'pt' : 'en';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) =>
      interpolate(dict[lang][key] ?? dict.en[key] ?? key, vars),
    [lang]
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside I18nProvider');
  return v;
}

export function useT() {
  return useI18n().t;
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={`inline-flex rounded-md border border-border overflow-hidden text-xs ${className}`}
    >
      {(['en', 'pt'] as const).map((l) => (
        <button
          key={l}
          className={`px-2 py-1 ${
            lang === l ? 'bg-accent text-black font-semibold' : 'text-muted hover:text-fg'
          }`}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
