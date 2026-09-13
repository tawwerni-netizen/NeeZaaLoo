package com.nizalo.core.model

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ModelTest {

    @Test
    fun `test all 10 launch games are correctly mapped`() {
        assertEquals(10, GameId.entries.size)
        assertEquals(GameId.CHESS, GameId.fromSlug("chess"))
        assertEquals(GameId.CHECKERS, GameId.fromSlug("checkers"))
        assertEquals(GameId.DOMINOES, GameId.fromSlug("dominoes"))
        assertEquals(GameId.BACKGAMMON, GameId.fromSlug("backgammon"))
        assertEquals(GameId.CONNECT_FOUR, GameId.fromSlug("connect-four"))
        assertEquals(GameId.SEEGA, GameId.fromSlug("seega"))
        assertEquals(GameId.XO, GameId.fromSlug("xo"))
        assertEquals(GameId.SPEED_MATH, GameId.fromSlug("speed-math"))
        assertEquals(GameId.REVERSI, GameId.fromSlug("reversi"))
        assertEquals(GameId.GOMOKU, GameId.fromSlug("gomoku"))
    }

    @Test
    fun `test 3D and hybrid 2_5D presentation types`() {
        assertEquals(PresentationType.FULL_3D, GameId.CHESS.presentationType)
        assertEquals(PresentationType.FULL_3D, GameId.CHECKERS.presentationType)
        assertEquals(PresentationType.FULL_3D, GameId.DOMINOES.presentationType)
        assertEquals(PresentationType.FULL_3D, GameId.BACKGAMMON.presentationType)
        assertEquals(PresentationType.FULL_3D, GameId.CONNECT_FOUR.presentationType)

        assertEquals(PresentationType.HYBRID_2_5D, GameId.SEEGA.presentationType)
        assertEquals(PresentationType.HYBRID_2_5D, GameId.XO.presentationType)
        assertEquals(PresentationType.HYBRID_2_5D, GameId.REVERSI.presentationType)
        assertEquals(PresentationType.HYBRID_2_5D, GameId.GOMOKU.presentationType)

        assertEquals(PresentationType.SPATIAL_EFFECTS, GameId.SPEED_MATH.presentationType)
    }

    @Test
    fun `test GSS tier mapping`() {
        assertEquals(PlayerTier.BRONZE, PlayerTier.fromGss(1000))
        assertEquals(PlayerTier.SILVER, PlayerTier.fromGss(1200))
        assertEquals(PlayerTier.GOLD, PlayerTier.fromGss(1400))
        assertEquals(PlayerTier.PLATINUM, PlayerTier.fromGss(1600))
        assertEquals(PlayerTier.DIAMOND, PlayerTier.fromGss(1850))
        assertEquals(PlayerTier.MASTER, PlayerTier.fromGss(2100))
        assertEquals(PlayerTier.GRANDMASTER, PlayerTier.fromGss(2500))
    }
}
