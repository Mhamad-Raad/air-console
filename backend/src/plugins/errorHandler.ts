import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors.js';

async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        issues: error.issues,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
  });
}

export default fp(errorHandler, { name: 'errorHandler' });
