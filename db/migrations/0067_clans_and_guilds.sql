-- Migration 0067: Clans & Guilds Foundation

CREATE TABLE clan (
  id varchar(32) PRIMARY KEY,
  name varchar(64) UNIQUE NOT NULL,
  tag varchar(8) UNIQUE NOT NULL,
  owner_id varchar(32) NOT NULL REFERENCES player(id),
  logo varchar(32) NOT NULL DEFAULT '🛡️',
  description text,
  global_elo integer NOT NULL DEFAULT 1500,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clan_member (
  clan_id varchar(32) NOT NULL REFERENCES clan(id),
  player_id varchar(32) NOT NULL REFERENCES player(id),
  role varchar(32) NOT NULL DEFAULT 'MEMBER', -- 'OWNER', 'OFFICER', 'MEMBER'
  joined_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clan_id, player_id)
);

CREATE TABLE clan_invite (
  id varchar(32) PRIMARY KEY,
  clan_id varchar(32) NOT NULL REFERENCES clan(id),
  player_id varchar(32) NOT NULL REFERENCES player(id),
  invited_by varchar(32) NOT NULL REFERENCES player(id),
  status varchar(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'DECLINED'
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Player profile extension for quick lookup
ALTER TABLE player ADD COLUMN clan_id varchar(32) REFERENCES clan(id);

CREATE INDEX idx_clan_elo ON clan(global_elo DESC);
CREATE INDEX idx_clan_member_player ON clan_member(player_id);
