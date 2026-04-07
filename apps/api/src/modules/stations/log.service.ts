import { stationRepository } from "../../db/repositories/station-repository";
import { AppError } from "../../utils/errors";

export const logService = {
  async listStationLogs(userId: string, stationId: string, limit = 60) {
    const station = await stationRepository.findByIdAndUser(stationId, userId);
    if (!station) {
      throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
    }

    const logs = await stationRepository.getRecentLogs(stationId, limit);
    return logs.map((log) => ({
      id: String(log.id),
      type: log.logType,
      message: log.message,
      payload: log.payload,
      createdAt: log.createdAt.toISOString()
    }));
  }
};
