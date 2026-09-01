// Bilingual content for the Rules screen. Kept out of lib/i18n.tsx because it is
// a large static document rather than short UI strings. Rendered by Rules.tsx.
//
// NOTE: the "Season" range and the "No Game Dates" list below are the
// human-readable mirror of lib/schedule.ts (SEASON_START/END + NO_GAME_DATES),
// which is what the "Next racha" card actually computes from. When a season
// changes, update BOTH this file and lib/schedule.ts.

export type Block =
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[]; ordered?: boolean }
  | { t: 'sub'; title: string; blocks: Block[] }
  | { t: 'callout'; tone: 'warn' | 'info'; text: string }
  | { t: 'kv'; rows: { k: string; v: string }[] }
  | { t: 'code'; text: string }
  // Season roster chips. Names are injected live from the Players tab at render
  // time (see Rules.tsx), so no list is stored here.
  | { t: 'chips' };

export interface Section {
  icon: string;
  title: string;
  blocks: Block[];
}

export type RulesDoc = Section[];

const REMINDER = `⚽ Racha de Segunda — Monday, [Insert Date], 6PM-8PM @ Elsie Roy (150 Drake St)

👉 Check in on the app — open the Check-in tab and tap "I'm in" or "Can't make it".
Confirm by Friday 3PM. Spots fill by check-in time, so don't leave it late!`;

const en: RulesDoc = [
  {
    icon: '📍',
    title: 'Schedule, Location & Season',
    blocks: [
      {
        t: 'kv',
        rows: [
          { k: 'Season', v: 'Sep 14, 2026 → Jun 21, 2027' },
          { k: 'Day & Time', v: 'Every Monday, 6:00 PM – 8:00 PM' },
          { k: 'Location', v: 'Elsie Roy Elementary School (Gym), Vancouver, BC' },
          { k: 'Address', v: '150 Drake St, Vancouver, BC V6Z 2X1' },
        ],
      },
    ],
  },
  {
    icon: '🚨',
    title: 'Emergency Information (Action Required)',
    blocks: [
      {
        t: 'p',
        text: 'For safety reasons, all players (both Season and Drop-In) must fill out their emergency contact details.',
      },
      {
        t: 'callout',
        tone: 'info',
        text: 'The organizer sends you a private link to fill in your details right here in the app — no more Google Sheets. Open it once and it stays saved for the season.',
      },
      { t: 'callout', tone: 'warn', text: 'Please fill it out before your first game.' },
    ],
  },
  {
    icon: '❌',
    title: 'No Game Dates (Court Closed)',
    blocks: [
      {
        t: 'p',
        text: 'No games on the following Mondays, due to statutory holidays and school closures:',
      },
      {
        t: 'list',
        items: [
          'Oct 12, 2026 — Thanksgiving',
          'Dec 21, 2026 — Winter Break',
          'Dec 28, 2026 — Winter Break',
          'Feb 15, 2027 — Family Day',
          'Mar 15, 2027 — Spring Break',
          'Mar 22, 2027 — Spring Break',
          'Mar 29, 2027 — Easter Monday',
          'May 24, 2027 — Victoria Day',
        ],
      },
    ],
  },
  {
    icon: '📱',
    title: 'Apps & Platform Management',
    blocks: [
      {
        t: 'sub',
        title: 'Attendance & RSVPs',
        blocks: [
          {
            t: 'p',
            text: 'Done in the app: open the Check-in tab and tap “I’m in” or “Can’t make it” for the next game. The app keeps the Confirmed list and Waitlist automatically — no WhatsApp poll to open or count. WhatsApp is only used for a weekly reminder to check in.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Teams & Stats App',
        blocks: [
          {
            t: 'p',
            text: 'We use {siteUrl} strictly to balance and draw teams, track player levels/skills, and log match scores and individual stats.',
          },
        ],
      },
    ],
  },
  {
    icon: '📅',
    title: 'Weekly Timeline & Attendance Priority',
    blocks: [
      {
        t: 'list',
        items: [
          'Any time during the week — check in on the app for the next game (it’s always open; no poll to wait for).',
          'Friday before 3:00 PM — deadline to change your mind (check out) without any penalty.',
          'Friday 3:00 PM — the list is final: the Confirmed players and Waitlist are set.',
        ],
      },
    ],
  },
  {
    icon: '👑',
    title: 'Roster Priority & First-Come, First-Served',
    blocks: [
      {
        t: 'p',
        text: 'The absolute priority for game spots follows this strict order: Season Players ➔ Drop-In (Group) ➔ Drop-In (External).',
      },
      {
        t: 'sub',
        title: 'Season Priority',
        blocks: [{ t: 'p', text: 'The 18 fixed season players have guaranteed spots to play.' }],
      },
      {
        t: 'sub',
        title: 'Drop-In Selection',
        blocks: [
          {
            t: 'p',
            text: 'If fewer than 15 season players confirm for the week, the remaining spots are filled by drop-ins, strictly by check-in time in the app — the sooner you check in, the better your chance. The app shows this live as the Confirmed list and the Waitlist.',
          },
        ],
      },
      {
        t: 'callout',
        tone: 'warn',
        text: 'No-Show Rule: if you are confirmed in the app after Friday 3:00 PM and fail to show up without a valid, last-minute emergency, you get a 1-game suspension.',
      },
    ],
  },
  {
    icon: '👥',
    title: 'Group Management & Maintenance',
    blocks: [
      {
        t: 'sub',
        title: 'Season Renewal Cleanup (Inactive Drop-ins)',
        blocks: [
          {
            t: 'p',
            text: 'When a season is ending, an official renewal poll is posted in the WhatsApp group. Any drop-in who fails to vote in this renewal poll is automatically removed from the group to keep the member list clean and active.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Ad-Hoc Drop-ins',
        blocks: [
          {
            t: 'p',
            text: 'New drop-in players can be added to the WhatsApp group on an ad-hoc basis throughout the season so they can access the weekly poll and sign up for available spots.',
          },
        ],
      },
    ],
  },
  {
    icon: '⏱️',
    title: 'Game Time Commitment (The 8:00 PM Rule)',
    blocks: [
      {
        t: 'callout',
        tone: 'warn',
        text: 'Play to the whistle: any confirmed player who leaves the court before 8:00 PM without a serious injury is automatically suspended from the next game. We need full squads until the end!',
      },
    ],
  },
  {
    icon: '🏃',
    title: 'Game Dynamic & On-Court Rules',
    blocks: [
      {
        t: 'sub',
        title: 'Match Format & Rotation',
        blocks: [
          {
            t: 'sub',
            title: 'Option 1 — Standard (15 players)',
            blocks: [
              {
                t: 'p',
                text: 'Exactly 15 players → 3 teams of 5 (no subs). Rotation: winner stays on, and the benched team waits 5 minutes to play.',
              },
            ],
          },
          {
            t: 'sub',
            title: 'Option 2 — Full House (16 to 18 players)',
            blocks: [
              {
                t: 'p',
                text: 'We expand the roster for the night: 3 teams with exactly 1 sub each (6 players max per team). The game runs 5-a-side; if a team has 6, one always waits outside. Rotation follows the established order and happens every 3 minutes. Match duration is extended to 6 minutes instead of 5.',
              },
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Bench Responsibilities (Game Control)',
        blocks: [
          { t: 'p', text: 'The team currently on the bench is fully responsible for managing the match.' },
          {
            t: 'list',
            items: [
              'No on-court yelling — players on the court should not track time, count down out loud, or shout when the match is over.',
              'The bench monitors the official app for precise timing and buzzes when the game ends.',
              'The bench logs all match stats (goals, assists, skills, saves, etc.) into the system.',
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Criteria for Tied Games',
        blocks: [
          {
            t: 'list',
            items: [
              'First game of the night: if it ends in a tie, the winner is decided by Odds or Evens (Par ou Ímpar).',
              'Subsequent games: if tied, the team that just entered (the challenger) stays on, and the team already playing must leave.',
            ],
          },
          {
            t: 'callout',
            tone: 'info',
            text: 'In short: you can play for a tie in the first game, but from the second game onwards the team on the pitch must win to stay on.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Court Boundaries (Walls & Out of Bounds)',
        blocks: [
          { t: 'p', text: 'There are no side outs — the walls are in play to keep the game moving fast.' },
          { t: 'p', text: 'The ball is only dead if it:' },
          {
            t: 'list',
            items: [
              'Goes past the baseline on the goalie’s side.',
              'Hits the ceiling.',
              'Hits the basketball rim itself (hitting the backboard or the support structures behind it is still in play).',
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Shooting, Goals & Penalties',
        blocks: [
          {
            t: 'list',
            items: [
              'Midfield restriction: you can only score from past the midfield line. No shooting from your own defensive half.',
              'Hockey goals: we use small hockey-style nets.',
            ],
          },
          {
            t: 'sub',
            title: 'Fouls in the Penalty Area',
            blocks: [
              {
                t: 'p',
                text: 'Intentional foul: if a defender intentionally fouls inside the box to prevent a goal, a penalty kick is awarded. The kicker shoots from the penalty line, and the goalie must stay completely still (frozen) wherever they positioned themselves — no moving to dive or block after the strike.',
              },
              {
                t: 'p',
                text: 'Unintentional foul: accidental infractions inside the box (unintentional handball, non-deliberate contact) do not result in a penalty. Instead, the ball is turned over directly to the opposing goalie to restart play.',
              },
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'No Hands Policy',
        blocks: [
          {
            t: 'p',
            text: 'Strictly no hands: there are absolutely no hand touches allowed, and this applies to everyone — including the goalies.',
          },
        ],
      },
    ],
  },
  {
    icon: '⚠️',
    title: 'Safety & Fair Play',
    blocks: [
      {
        t: 'list',
        items: [
          'Call your own foul: if you feel you were fouled, call it — don’t leave it to the other player. We are all respectful here, and if you call a foul, it will be given to you (within reason).',
          'No slide tackles: sliding on the floor to tackle, block, or challenge is strictly prohibited to prevent injuries. Stay on your feet!',
        ],
      },
    ],
  },
  {
    icon: '💰',
    title: 'Fees & Financial Policy',
    blocks: [
      {
        t: 'sub',
        title: 'Season Players',
        blocks: [
          {
            t: 'p',
            text: 'Because the season cost is split strictly across the fixed number of committed players, once you confirm and pay for the season, no refunds will be issued.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Drop-In Players',
        blocks: [
          {
            t: 'kv',
            rows: [
              { k: 'Fee', v: '$10 CAD' },
              { k: 'Deadline', v: 'Before the game starts — no pay, no play' },
              { k: 'Methods', v: 'Cash or e-Transfer' },
              { k: 'e-Transfer', v: '{etransfer}' },
            ],
          },
        ],
      },
    ],
  },
  {
    icon: '🧑‍🤝‍🧑',
    title: 'Official Season Roster',
    blocks: [{ t: 'chips' }],
  },
  {
    icon: '📝',
    title: 'WhatsApp Reminder',
    blocks: [
      {
        t: 'p',
        text: 'No more poll to open or tally. Once a week, drop a reminder in the group so people check in on the app. The Check-in screen has a “Copy WhatsApp reminder” button that fills in the date and current count for you.',
      },
      {
        t: 'sub',
        title: 'Weekly reminder',
        blocks: [{ t: 'code', text: REMINDER }],
      },
    ],
  },
];

const pt: RulesDoc = [
  {
    icon: '📍',
    title: 'Horário, Local & Temporada',
    blocks: [
      {
        t: 'kv',
        rows: [
          { k: 'Temporada', v: '14/set/2026 → 21/jun/2027' },
          { k: 'Dia & Horário', v: 'Toda segunda, 18h00 – 20h00' },
          { k: 'Local', v: 'Elsie Roy Elementary School (Gym), Vancouver, BC' },
          { k: 'Endereço', v: '150 Drake St, Vancouver, BC V6Z 2X1' },
        ],
      },
    ],
  },
  {
    icon: '🚨',
    title: 'Informações de Emergência (Ação Necessária)',
    blocks: [
      {
        t: 'p',
        text: 'Por segurança, todos os jogadores (fixos e avulsos) precisam preencher os dados de contato de emergência.',
      },
      {
        t: 'callout',
        tone: 'info',
        text: 'O organizador te envia um link privado para preencher seus dados aqui no app — sem mais Google Sheets. Abra uma vez e fica salvo pela temporada.',
      },
      { t: 'callout', tone: 'warn', text: 'Preencha antes do seu primeiro jogo.' },
    ],
  },
  {
    icon: '❌',
    title: 'Datas Sem Jogo (Quadra Fechada)',
    blocks: [
      {
        t: 'p',
        text: 'Não teremos jogo nas seguintes segundas, por feriados e fechamento da escola:',
      },
      {
        t: 'list',
        items: [
          '12/out/2026 — Thanksgiving',
          '21/dez/2026 — Recesso de inverno',
          '28/dez/2026 — Recesso de inverno',
          '15/fev/2027 — Family Day',
          '15/mar/2027 — Spring Break',
          '22/mar/2027 — Spring Break',
          '29/mar/2027 — Segunda de Páscoa',
          '24/mai/2027 — Victoria Day',
        ],
      },
    ],
  },
  {
    icon: '📱',
    title: 'Apps & Gestão da Plataforma',
    blocks: [
      {
        t: 'sub',
        title: 'Presença & Confirmações',
        blocks: [
          {
            t: 'p',
            text: 'Feitas no app: abra a aba Presença e toque em “Eu vou” ou “Não vou” para o próximo jogo. O app mantém a lista de Confirmados e a de Espera automaticamente — sem enquete do WhatsApp para abrir ou contar. O WhatsApp serve só para o lembrete semanal de confirmar presença.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'App de Times & Estatísticas',
        blocks: [
          {
            t: 'p',
            text: 'Usamos o {siteUrl} apenas para balancear e sortear os times, acompanhar o nível/skills dos jogadores e registrar placares e estatísticas individuais.',
          },
        ],
      },
    ],
  },
  {
    icon: '📅',
    title: 'Cronograma Semanal & Prioridade',
    blocks: [
      {
        t: 'list',
        items: [
          'Durante a semana — confirme presença no app para o próximo jogo (fica sempre aberto; sem enquete para esperar).',
          'Sexta antes das 15h00 — prazo para desistir (marcar “Não vou”) sem punição.',
          'Sexta 15h00 — a lista é final: os Confirmados e a lista de Espera ficam definidos.',
        ],
      },
    ],
  },
  {
    icon: '👑',
    title: 'Prioridade de Vagas & Ordem de Chegada',
    blocks: [
      {
        t: 'p',
        text: 'A prioridade absoluta das vagas segue esta ordem estrita: Jogadores Fixos ➔ Avulsos (Grupo) ➔ Avulsos (Externos).',
      },
      {
        t: 'sub',
        title: 'Prioridade dos Fixos',
        blocks: [{ t: 'p', text: 'Os 18 jogadores fixos da temporada têm vaga garantida.' }],
      },
      {
        t: 'sub',
        title: 'Seleção dos Avulsos',
        blocks: [
          {
            t: 'p',
            text: 'Se menos de 15 fixos confirmarem na semana, as vagas restantes são preenchidas por avulsos, estritamente pela ordem/horário de confirmação no app — quanto antes confirmar, maior a chance. O app mostra isso ao vivo como lista de Confirmados e lista de Espera.',
          },
        ],
      },
      {
        t: 'callout',
        tone: 'warn',
        text: 'Regra do No-Show: se você está confirmado no app depois de sexta 15h00 e não aparece sem uma emergência de última hora válida, leva 1 jogo de suspensão.',
      },
    ],
  },
  {
    icon: '👥',
    title: 'Gestão & Manutenção do Grupo',
    blocks: [
      {
        t: 'sub',
        title: 'Limpeza na Renovação (Avulsos Inativos)',
        blocks: [
          {
            t: 'p',
            text: 'Ao fim de cada temporada, uma enquete oficial de renovação é postada no grupo. Qualquer avulso que não votar nessa enquete é removido automaticamente do grupo, para manter a lista de membros limpa e ativa.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Avulsos Ad-Hoc',
        blocks: [
          {
            t: 'p',
            text: 'Novos avulsos podem ser adicionados ao grupo do WhatsApp de forma pontual ao longo da temporada, para acessar a enquete semanal e pegar vagas disponíveis.',
          },
        ],
      },
    ],
  },
  {
    icon: '⏱️',
    title: 'Compromisso de Horário (A Regra das 20h)',
    blocks: [
      {
        t: 'callout',
        tone: 'warn',
        text: 'Jogue até o apito: qualquer jogador confirmado que sair da quadra antes das 20h00 sem lesão séria é automaticamente suspenso do próximo jogo. Precisamos de times completos até o fim!',
      },
    ],
  },
  {
    icon: '🏃',
    title: 'Dinâmica de Jogo & Regras em Quadra',
    blocks: [
      {
        t: 'sub',
        title: 'Formato & Rotação (depende da presença)',
        blocks: [
          {
            t: 'sub',
            title: 'Opção 1 — Padrão (15 jogadores)',
            blocks: [
              {
                t: 'p',
                text: 'Exatamente 15 jogadores → 3 times de 5 (sem reservas). Rotação: quem vence fica, e o time do banco espera 5 minutos para jogar.',
              },
            ],
          },
          {
            t: 'sub',
            title: 'Opção 2 — Casa Cheia (16 a 18 jogadores)',
            blocks: [
              {
                t: 'p',
                text: 'Ampliamos o elenco da noite: 3 times com exatamente 1 reserva cada (máx. 6 por time). O jogo é 5 contra 5; se um time tem 6, um sempre espera fora. A rotação segue a ordem combinada e acontece a cada 3 minutos. A duração da partida sobe para 6 minutos em vez de 5.',
              },
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Responsabilidades do Banco (Controle do Jogo)',
        blocks: [
          { t: 'p', text: 'O time que está no banco é totalmente responsável por gerenciar a partida.' },
          {
            t: 'list',
            items: [
              'Sem gritaria em quadra — quem está jogando não deve controlar o tempo, contar em voz alta nem gritar quando o jogo acaba.',
              'O banco acompanha o app oficial para o tempo exato e apita quando o jogo termina.',
              'O banco registra todas as estatísticas (gols, assistências, skills, defesas, etc.) no sistema.',
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Critério de Desempate',
        blocks: [
          {
            t: 'list',
            items: [
              'Primeiro jogo da noite: se empatar, o vencedor sai no Par ou Ímpar.',
              'Jogos seguintes: se empatar, o time que acabou de entrar (o desafiante) fica, e o time que já estava jogando sai.',
            ],
          },
          {
            t: 'callout',
            tone: 'info',
            text: 'Resumo: dá pra jogar pelo empate no primeiro jogo, mas do segundo em diante o time que está em quadra precisa vencer para ficar.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Limites da Quadra (Paredes & Fora)',
        blocks: [
          { t: 'p', text: 'Não tem lateral — as paredes estão em jogo para manter o ritmo rápido.' },
          { t: 'p', text: 'A bola só está morta se:' },
          {
            t: 'list',
            items: [
              'Passar da linha de fundo do lado do goleiro.',
              'Bater no teto.',
              'Bater no aro da cesta de basquete (bater na tabela ou nas estruturas de suporte atrás dela continua em jogo).',
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Finalização, Gols & Pênaltis',
        blocks: [
          {
            t: 'list',
            items: [
              'Restrição do meio: só vale gol a partir da linha do meio para frente. Sem chutar do próprio campo de defesa.',
              'Gols de hóquei: usamos as traves pequenas estilo hóquei.',
            ],
          },
          {
            t: 'sub',
            title: 'Faltas na Área',
            blocks: [
              {
                t: 'p',
                text: 'Falta intencional: se um defensor comete falta de propósito dentro da área para evitar o gol, é pênalti. O batedor cobra da marca, e o goleiro fica completamente parado (congelado) onde escolheu se posicionar — sem se mexer para defender ou espalmar depois da batida.',
              },
              {
                t: 'p',
                text: 'Falta não intencional: infrações acidentais dentro da área (mão sem intenção, contato não deliberado) não dão pênalti. Em vez disso, a bola é entregue direto ao goleiro adversário para reiniciar o jogo.',
              },
            ],
          },
        ],
      },
      {
        t: 'sub',
        title: 'Política de Não Usar as Mãos',
        blocks: [
          {
            t: 'p',
            text: 'Proibido usar a mão: absolutamente nenhum toque de mão é permitido, e isso vale para todo mundo — inclusive os goleiros.',
          },
        ],
      },
    ],
  },
  {
    icon: '⚠️',
    title: 'Segurança & Fair Play',
    blocks: [
      {
        t: 'list',
        items: [
          'Marque a sua própria falta: se sentiu que sofreu falta, marque — não deixe pro outro decidir. Somos todos respeitosos aqui, e se você marcar uma falta, ela é sua (dentro do razoável).',
          'Sem carrinho: escorregar no chão para dividir, bloquear ou dar carrinho é totalmente proibido para evitar lesões. Fique de pé!',
        ],
      },
    ],
  },
  {
    icon: '💰',
    title: 'Taxas & Política Financeira',
    blocks: [
      {
        t: 'sub',
        title: 'Jogadores Fixos',
        blocks: [
          {
            t: 'p',
            text: 'Como o custo da temporada é dividido estritamente entre o número fixo de jogadores comprometidos, uma vez confirmado e pago, não há reembolso.',
          },
        ],
      },
      {
        t: 'sub',
        title: 'Avulsos',
        blocks: [
          {
            t: 'kv',
            rows: [
              { k: 'Taxa', v: '$10 CAD' },
              { k: 'Prazo', v: 'Antes do jogo começar — sem pagar, sem jogar' },
              { k: 'Formas', v: 'Dinheiro ou e-Transfer' },
              { k: 'e-Transfer', v: '{etransfer}' },
            ],
          },
        ],
      },
    ],
  },
  {
    icon: '🧑‍🤝‍🧑',
    title: 'Elenco Oficial da Temporada',
    blocks: [{ t: 'chips' }],
  },
  {
    icon: '📝',
    title: 'Lembrete do WhatsApp',
    blocks: [
      {
        t: 'p',
        text: 'Sem enquete para abrir ou contar. Uma vez por semana, mande um lembrete no grupo para o pessoal confirmar no app. A tela de Presença tem um botão “Copiar lembrete do WhatsApp” que já preenche a data e o total de confirmados.',
      },
      {
        t: 'sub',
        title: 'Lembrete semanal',
        blocks: [{ t: 'code', text: REMINDER }],
      },
    ],
  },
];

export const rulesDoc: Record<'en' | 'pt', RulesDoc> = { en, pt };
