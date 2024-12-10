<?php

namespace App\Domain\Strava\Gear\ImportGear;

use App\Domain\Strava\Activity\ActivityRepository;
use App\Domain\Strava\Gear\Gear;
use App\Domain\Strava\Gear\GearRepository;
use App\Domain\Strava\MaxResourceUsageHasBeenReached;
use App\Domain\Strava\Strava;
use App\Domain\Strava\StravaErrorStatusCode;
use App\Infrastructure\CQRS\Bus\Command;
use App\Infrastructure\CQRS\Bus\CommandHandler;
use App\Infrastructure\Exception\EntityNotFound;
use App\Infrastructure\Time\Clock\Clock;
use App\Infrastructure\Time\Sleep;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\RequestException;

final readonly class ImportGearCommandHandler implements CommandHandler
{
    public function __construct(
        private Strava $strava,
        private ActivityRepository $activityRepository,
        private GearRepository $gearRepository,
        private MaxResourceUsageHasBeenReached $maxResourceUsageHasBeenReached,
        private Clock $clock,
        private Sleep $sleep,
    ) {
    }

    public function handle(Command $command): void
    {
        assert($command instanceof ImportGear);
        $command->getOutput()->writeln('Importing gear...');

        $gearIds = $this->activityRepository->findUniqueGearIds();

        foreach ($gearIds as $gearId) {
            try {
                $stravaGear = $this->strava->getGear($gearId);
            } catch (ClientException|RequestException $exception) {
                if (!$exception->getResponse() || !StravaErrorStatusCode::tryFrom(
                    $exception->getResponse()->getStatusCode()
                )) {
                    // Re-throw, we only want to catch supported error codes.
                    throw $exception;
                }
                // This will allow initial imports with a lot of activities to proceed the next day.
                // This occurs when we exceed Strava API rate limits or throws an unexpected error.
                $this->maxResourceUsageHasBeenReached->markAsReached();
                $command->getOutput()->writeln('<error>You probably reached Strava API rate limits. You will need to import the rest of your activities tomorrow</error>');

                return;
            }

            try {
                $gear = $this->gearRepository->find($gearId);
                $gear
                    ->updateDistance($stravaGear['distance'], $stravaGear['converted_distance'])
                ->updateIsRetired($stravaGear['retired'] ?? false);
                $this->gearRepository->update($gear);
            } catch (EntityNotFound) {
                $gear = Gear::create(
                    gearId: $gearId,
                    data: $stravaGear,
                    distanceInMeter: $stravaGear['distance'],
                    createdOn: $this->clock->getCurrentDateTimeImmutable(),
                );
                $this->gearRepository->add($gear);
            }
            $command->getOutput()->writeln(sprintf('  => Imported/updated gear "%s"', $gear->getName()));
            // Try to avoid Strava rate limits.
            $this->sleep->sweetDreams(10);
        }
    }
}
