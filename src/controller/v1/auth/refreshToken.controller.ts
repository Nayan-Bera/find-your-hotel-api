import { eq } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { JwtPayload } from 'jsonwebtoken';
import { config } from '../../../config';
import db from '../../../db';
import { refreshTokens as refreshTokenDb, users } from '../../../db/schema';
import CustomErrorHandler from '../../../Services/customErrorHandaler';
import JwtService from '../../../Services/jwtService';

const refreshSchema = Joi.object({
    refresh_token: Joi.string().required(),
});

const refreshTokenController = {
    async refresh(req: Request, res: Response, next: NextFunction) {
        const { error } = refreshSchema.validate(req.body);

        if (error) {
            return next(error);
        }

        let refreshTokenDocument;

        try {
            refreshTokenDocument = await db.query.refreshTokens.findFirst({
                where: eq(refreshTokenDb?.token, req.body.refresh_token),
            });

            if (!refreshTokenDocument || !refreshTokenDocument.token) {
                return next(
                    CustomErrorHandler.unAuthorized('Invalid refresh token'),
                );
            }

            let userId: string;
            try {
                const { id } = (await JwtService.verify(
                    refreshTokenDocument.token,
                    config.REFRESH_SECRET,
                )) as JwtPayload;
                userId = id;
            } catch (err) {
                return next(
                    CustomErrorHandler.unAuthorized('Invalid refresh token'),
                );
            }

            const userRes = await db.query.users.findFirst({
                where: eq(users?.id, userId),
            });
            if (!userRes) {
                return next(CustomErrorHandler.unAuthorized('No user found!'));
            }

            const access_token = JwtService.sign({
                id: userRes?.id,
                role: userRes?.role,
            });
            const refresh_token = JwtService.sign(
                { id: userRes?.id, role: userRes?.role },
                '1y',
                config.REFRESH_SECRET,
            );
            await db
                .update(refreshTokenDb)
                .set({
                    token: refresh_token,
                })
                .where(eq(refreshTokenDb.token, req.body.refresh_token));
            res.json({ access_token, refresh_token });
        } catch (error) {
            return next(new Error('Something went wrong'));
        }
    },
};

export default refreshTokenController;
