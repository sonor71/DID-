export const GENRES = ['Фэнтези','Хоррор','Детектив','Романтика','Фантастика','Драма','Приключения','Мистика','Поэзия'];
export const FEEDBACK_CATEGORIES = ['Сюжет','Персонажи','Стиль','Атмосфера','Темп'];
export const ANNOTATION_TYPES = [['unclear','? Непонятно'],['strange','⚠ Странно'],['disputed','≠ Спорно'],['comment','💬 Комментарий']];

export const seedPeople = [
  {id:'p-elara',name:'Elara Vance',username:'elara',role:'Автор',online:true},
  {id:'p-mara',name:'Mara Chen',username:'mara',role:'Иллюстратор',online:true},
  {id:'p-james',name:'James Ellington',username:'james',role:'Редактор',online:false},
  {id:'p-kai',name:'Kai Isted',username:'kai',role:'Корректор',online:true},
  {id:'p-jasper',name:'Jasper Thorne',username:'jasper',role:'Читатель',online:true},
  {id:'p-rowan',name:'M. K. Rowan',username:'rowan',role:'Автор',online:false}
];

export const seedWorks = [
  {
    id:'w-artificial', title:'Искусственная судьба', authorId:'seed-a1', author:'Дмитрий Бабиков',
    cover:'/assets/home/seventh-horizon.png', genres:['Детектив','Хоррор','Мистика'], tags:['психология','тайна','тёмная атмосфера'],
    kind:'Роман', minutes:22, status:'evaluation', version:'1.0', rating:4.4, ratingsCount:31, authorActivity:78, createdAt:'2026-09-10',
    summary:'Мрачная история о выборе, памяти и последствиях решений. Автор просит обратную связь по темпу, атмосфере и мотивации героев.',
    evaluationTarget:'Глава 1 — фрагмент', feedbackWanted:['Сюжет','Персонажи','Атмосфера','Темп'],
    content:`Вечер опустился на город слишком быстро. Брайан заметил это ещё у старой набережной, где фонари отражались в воде длинными золотыми полосами. Он шёл медленно, стараясь не смотреть на окна домов.\n\nПисьмо лежало во внутреннем кармане пальто. Он перечитал его уже четыре раза и каждый раз находил в последней строке иной смысл. Иногда ему казалось, что автор просит о помощи. Иногда — что предупреждает.\n\nУ двери дома номер семь Брайан остановился. Ещё утром он поклялся себе никогда сюда не возвращаться. Теперь же рука сама легла на холодную металлическую ручку.\n\nВнутри пахло пылью, воском и чем-то едва различимым, похожим на озон после грозы. На столе в прихожей лежали часы. Стрелки двигались назад.`
  },
  {
    id:'w-horizon', title:'The Seventh Horizon', authorId:'seed-a2', author:'Elara Vance',
    cover:'/assets/home/seventh-horizon.png', genres:['Фэнтези','Приключения'], tags:['эпическое фэнтези','мир','дружба'],
    kind:'Роман', minutes:18, status:'evaluation', version:'1.2', rating:4.7, ratingsCount:124, authorActivity:91, createdAt:'2026-09-12',
    summary:'Каэл отправляется за пределы последней известной карты. Нужна оценка атмосферы и темпа двенадцатой главы.',
    evaluationTarget:'Глава 12', feedbackWanted:['Атмосфера','Темп','Персонажи'],
    content:`The rain had stopped, but the world still felt drenched. Kael stood at the edge of the observatory, where the stone met the sky, and let the cold wind find him.\n\nBelow, the city slept in fragments — lanterns guttering, rooftops shining, the river like a dark ribbon pulling secrets toward the sea.\n\nHe had always loved this hour. Not for its beauty, but for its honesty. The world was quieter then, and in the quiet, the noise inside him finally made sense.\n\nSomewhere behind him, a door creaked. He did not turn. “You’re late,” he said.`
  },
  {
    id:'w-river', title:'A River Remembers', authorId:'seed-a3', author:'M. K. Rowan',
    cover:'/assets/home/river-remembers.png', genres:['Драма','Приключения'], tags:['память','семья','дорога'],
    kind:'Повесть', minutes:12, status:'evaluation', version:'1.0', rating:4.2, ratingsCount:18, authorActivity:54, createdAt:'2026-09-13',
    summary:'Небольшая повесть о возвращении домой и памяти. Автор ищет честные отзывы о финале.',
    evaluationTarget:'Весь текст', feedbackWanted:['Сюжет','Стиль','Атмосфера'],
    content:`Река помнила больше, чем люди. Она помнила старый мост до пожара, голоса рыбаков и летние грозы, после которых вода становилась почти чёрной.\n\nМира вернулась спустя двенадцать лет и сразу поняла, что город её не ждал. Магазин на углу сменил вывеску, школьный двор обнесли новым забором, а дом матери казался меньше, чем в детстве.\n\nТолько река оставалась прежней. Именно к ней Мира пошла прежде, чем открыть дверь дома.`
  },
  {
    id:'w-clock', title:'Город без часов', authorId:'seed-a4', author:'Артём Северин',
    cover:'/assets/home/reading-cover.png', genres:['Фантастика','Детектив'], tags:['время','город','заговор'], kind:'Рассказ', minutes:9, status:'evaluation', version:'1.0', rating:4.0, ratingsCount:7, authorActivity:34, createdAt:'2026-09-14',
    summary:'В городе запрещены часы, но герой находит механизм, который показывает не время, а чужие воспоминания.', evaluationTarget:'Весь рассказ', feedbackWanted:['Сюжет','Стиль','Темп'],
    content:`В городе не было часов. Их сняли с башен, вытащили из вокзальных залов и запретили носить на руке. Люди научились ориентироваться по свету, по очередям в кафе и по гулу трамваев.\n\nОднажды Лев нашёл карманные часы в стене собственной квартиры. Когда он открыл крышку, стрелки не двигались. Вместо этого на внутренней стороне стекла появилось лицо женщины, которую он никогда не видел.`
  },
  {
    id:'w-snow', title:'Белый коридор', authorId:'seed-a5', author:'Ника Ланская',
    cover:'/assets/home/sidebar-art.png', genres:['Хоррор','Мистика'], tags:['изоляция','снег','неизвестность'], kind:'Фрагмент', minutes:6, status:'evaluation', version:'0.8', rating:4.5, ratingsCount:12, authorActivity:47, createdAt:'2026-09-14',
    summary:'Черновой фрагмент хоррора. Автор хочет понять, работает ли напряжение без прямого объяснения происходящего.', evaluationTarget:'Фрагмент 1', feedbackWanted:['Атмосфера','Темп','Стиль'],
    content:`Коридор заканчивался дверью, которой вчера не было. Я проверил план этажа дважды, потом позвал дежурного. Он посмотрел туда, куда я показывал, и сказал, что видит только стену.\n\nСнег за окнами шёл горизонтально. Свет моргал каждые двадцать секунд. На третий раз дверь оказалась ближе.`
  }
];

export const seedPosts = [
  {id:'p1', author:'Elara Vance', username:'elara', role:'Автор', createdAt:'2026-09-18T12:42:00+03:00', text:'Выложила двенадцатую главу. Особенно интересно, как воспринимается темп второй сцены.', likes:342, comments:56, workId:'w-horizon',media:[{media_type:'image',url:'/assets/home/seventh-horizon.png',alt_text:'The Seventh Horizon'}]},
  {id:'p-news1', author:'Редакция FRAKTUM', username:'d20', role:'Интервью', createdAt:'2026-09-18T10:15:00+03:00', text:'«Первый читатель важнее первого издателя» — разговор с новым автором о первых 100 читателях, критике и переписывании дебютного романа.', likes:94, comments:18, editorial:true,media:[{media_type:'image',url:'/assets/home/sidebar-art.png',alt_text:'Интервью FRAKTUM'}]},
  {id:'p2', author:'Jasper Thorne', role:'Читатель', createdAt:'2026-09-17T21:10:00+03:00', text:'Что для вас важнее в начале романа: сильная атмосфера или быстрый конфликт?', likes:120, comments:42},
  {id:'p-news2', author:'Редакция FRAKTUM', role:'Совет авторам', createdAt:'2026-09-17T17:30:00+03:00', text:'Как просить обратную связь так, чтобы она была полезной: почему вопрос «ну как тебе?» почти бесполезен и какие категории оценки лучше задавать заранее.', likes:76, comments:11, editorial:true},
  {id:'p3', author:'M. K. Rowan', username:'rowan', role:'Автор', createdAt:'2026-09-16T19:05:00+03:00', text:'Переписал финал «A River Remembers» после первых отзывов. Новая версия уже доступна.', likes:87, comments:19, workId:'w-river',media:[{media_type:'image',url:'/assets/home/river-remembers.png',alt_text:'A River Remembers'},{media_type:'image',url:'/assets/home/quote-card.png',alt_text:'Цитата из произведения'}]}
];

export const seedPostComments = [
  {id:'pc1',postId:'p1',author:'MiraK',text:'Вторая сцена сильнее первой, но переход между ними я бы сделал чуть мягче.',time:'18:42',myReaction:null,reactions:{helpful:12,disagree:3,unhelpful:1}},
  {id:'pc2',postId:'p1',author:'Jasper Thorne',text:'Мне наоборот понравился резкий переход — он ускоряет главу.',time:'18:55',myReaction:null,reactions:{helpful:5,disagree:8,unhelpful:0}},
  {id:'pc3',postId:'p2',author:'Elara Vance',text:'Для меня атмосфера важнее, если конфликт появляется хотя бы к концу первой сцены.',time:'17:11',myReaction:null,reactions:{helpful:9,disagree:2,unhelpful:0}},
  {id:'pc4',postId:'p-news1',author:'Rowan',text:'Хорошо, что показываете малоизвестных авторов, а не только тех, у кого уже есть аудитория.',time:'16:05',myReaction:null,reactions:{helpful:17,disagree:1,unhelpful:0}}
];

export const seedCommunities = [
  {id:'c1', name:'Начинающие авторы', type:'Авторы', privacy:'public', members:1240, description:'Черновики, разборы, вопросы о публикации и взаимная критика.'},
  {id:'c2', name:'Готический роман', type:'Жанр', privacy:'public', members:814, description:'Готика, хоррор, мистика и атмосферная проза.'},
  {id:'c3', name:'Ночной флуд', type:'Флуд', privacy:'public', members:2031, description:'Свободное общение без обязательной литературной темы.'},
  {id:'c4', name:'The Seventh Horizon', type:'Фандом', privacy:'request', members:526, description:'Фан-сообщество произведения и обсуждение новых глав.'}
];

export const journalItems = [
  {type:'Интервью', title:'«Первый читатель важнее первого издателя»', author:'Александр Рейн', summary:'Разговор с малоизвестным автором о первых 100 читателях, критике и переписывании дебютного романа.'},
  {type:'Совет', title:'Как просить обратную связь так, чтобы она была полезной', author:'Редакция', summary:'Почему вопрос «ну как тебе?» почти бесполезен и какие категории оценки лучше задавать заранее.'},
  {type:'Совет', title:'Пять способов проверить темп главы', author:'Редакция', summary:'Практический чек-лист для самостоятельной проверки сцены до публикации черновика.'}
];

export const specialists = [
  {id:'s1', name:'Мария Вельская', role:'Иллюстратор', tags:['Готика','Персонажи','Обложки'], rating:4.9, projects:43, price:'от 3 000 ₽'},
  {id:'s2', name:'Александр Торн', role:'Редактор', tags:['Фэнтези','Детектив','Структура'], rating:4.8, projects:71, price:'от 1.5 ₽/знак'},
  {id:'s3', name:'Лин Тран', role:'Иллюстратор', tags:['Персонажи','Anime','Fantasy'], rating:4.9, projects:96, price:'от 4 500 ₽'},
  {id:'s4', name:'Елена Мирова', role:'Корректор', tags:['Русский язык','Проза','Нон-фикшн'], rating:4.7, projects:128, price:'от 0.8 ₽/знак'}
];
