import {
	Arg,
	Ctx,
	Field,
	InputType,
	Mutation,
	ObjectType,
	Query,
	Resolver,
} from 'type-graphql';
import argon2 from 'argon2';

import { __PROD__ } from '../constants';
import { Context } from '../index';
import { User } from '../models/user.model';
import { FieldError } from '../models/error.model';
import {
	validatePasswordMatch,
	validatePasswordStrength,
	validateUserDoesNotExist,
	validateUserExists,
} from '../validators/user.validators';

@InputType()
class UsernamePasswordInput implements Partial<User> {
	@Field()
	username: string;

	@Field()
	password: string;
}

@ObjectType()
export class UserResponse {
	@Field(() => [FieldError], { nullable: true })
	errors?: FieldError[];

	@Field(() => User, { nullable: true })
	user?: User;
}

@Resolver()
export class UserResolver {
	/**
	 * Attempts to find a user in the db with a given id
	 * @param id The id being queried
	 * @param prisma The prisma client
	 */
	@Query(() => User)
	async user(@Arg('id') id: number, @Ctx() { prisma }: Context) {
		return await prisma.user.findUnique({ where: { id } });
	}

	/**
	 * Attempts to register a user account given a username and password
	 * @param options The username and password
	 * @param prisma The prisma client
	 */
	@Mutation(() => UserResponse)
	async register(
		@Arg('options') options: UsernamePasswordInput,
		@Ctx() { prisma }: Context,
	): Promise<UserResponse> {
		// Pulls the username and password off of the options
		const { username, password } = options;

		// Used to keep track of any errors that occur
		const errors = [
			...(await validateUserDoesNotExist(username, prisma)),
			...validatePasswordStrength(password),
		];

		// Checks if there were any errors
		if (errors.length > 0) {
			return { errors };
		}

		// Generates a hash of the users password
		const hashedPassword = await argon2.hash(password);

		// Attempts to write the user to the db
		const user = await prisma.user.create({
			data: { username, password: hashedPassword },
		});

		return { user };
	}

	/**
	 * Attempts to log a user in with given credentials
	 * @param options The username and password credentials
	 * @param prisma The prisma client
	 */
	@Mutation(() => UserResponse)
	async login(
		@Arg('options') options: UsernamePasswordInput,
		@Ctx() { prisma }: Context,
	): Promise<UserResponse> {
		// Pulls the username and password off of the options
		const { username, password } = options;

		// Checks if the user exists,
		// If so then the user will be an object an errors will be []
		// Otherwise, user will be null and error will be non-empty
		let { errors, user } = await validateUserExists(username, prisma);

		if ((errors && errors.length > 0) || !user) {
			return { errors };
		}

		// Checks that the password matches, otherwise adds errors
		errors = [...(await validatePasswordMatch(user.password, password))];

		if (errors.length > 0) {
			return { errors };
		}

		// If the code reaches here, the user exists and the password matches
		// Sends the user their information
		return { user };
	}
}
