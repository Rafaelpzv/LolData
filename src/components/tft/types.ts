/** Subset of tft-match-v1 used by the TFT profile. */

export interface TftTrait {
  name: string;
  num_units: number;
  /** 0 inactive, 1 bronze, 2 silver, 3 gold, 4+ prismatic. */
  style: number;
  tier_current: number;
  tier_total: number;
}

export interface TftUnit {
  character_id: string;
  name?: string;
  tier: number;
  rarity?: number;
  itemNames?: string[];
  /** Legacy numeric item ids (older match payloads). */
  items?: number[];
}

export interface TftParticipant {
  puuid: string;
  placement: number;
  level: number;
  gold_left: number;
  last_round?: number;
  total_damage_to_players?: number;
  players_eliminated?: number;
  augments?: string[];
  traits?: TftTrait[];
  units?: TftUnit[];
}

export interface TftMatch {
  metadata: {
    match_id: string;
    participants: string[];
  };
  info: {
    game_datetime: number;
    game_length: number;
    game_version?: string;
    queue_id?: number;
    tft_game_type?: string;
    tft_set_number?: number;
    participants: TftParticipant[];
  };
}
