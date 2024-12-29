<?php

namespace App\Domain\Strava\Activity;

enum ActivityType: string
{
    case RIDE = 'Ride';
    case VIRTUAL_RIDE = 'VirtualRide';
    case RUN = 'Run';

    public function supportsWeather(): bool
    {
        return self::RIDE === $this || self::RUN === $this;
    }

    public function supportsReverseGeocoding(): bool
    {
        return self::RIDE === $this || self::RUN === $this;
    }

    public function isVirtual(): bool
    {
        return self::VIRTUAL_RIDE === $this;
    }

    public function isRide(): bool
    {
        return self::RIDE === $this || self::VIRTUAL_RIDE === $this;
    }

    public function isRun(): bool
    {
        return self::RUN === $this;
    }
}
