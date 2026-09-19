-- Clean all bot player handles to ensure natural human names with ZERO numbers
UPDATE player SET handle = 'Karim_AlMasry', bio = 'لاعب شطرنج هاوٍ يعشق التكتيكات السريعة ♟️' WHERE id = 'ai-easy';
UPDATE player SET handle = 'Tariq_AlKhaled', bio = 'منافس دائم على بطولات الطاولة والشطرنج 🎲' WHERE id = 'ai-medium';
UPDATE player SET handle = 'Sultan_AlGhamdi', bio = 'محترف استراتيجيات وألعاب لوحية، 1850 ELO ⚡' WHERE id = 'ai-hard';
UPDATE player SET handle = 'Farouk_AlSharif', bio = 'جراند ماستر، بطل بطولات نيزالو 👑' WHERE id = 'ai-expert';

-- Strip any trailing numeric suffix like _12, _45, _82 from all bot handles
UPDATE player
   SET handle = regexp_replace(handle, '_[0-9]+$', '')
 WHERE is_ai = TRUE
   AND handle ~ '_[0-9]+$';

-- Also strip any trailing numbers without underscores
UPDATE player
   SET handle = regexp_replace(handle, '[0-9]+$', '')
 WHERE is_ai = TRUE
   AND handle ~ '[0-9]+$';
