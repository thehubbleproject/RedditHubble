import { BigNumber, BigNumberish, BytesLike, ethers } from "ethers";
import { EncodingError } from "./exceptions";
import { randomHex } from "./utils";

export class DecimalCodec {
    private mantissaMax: BigNumber;
    private exponentMax: number;
    private exponentMask: BigNumber;
    public bytesLength: number;

    constructor(
        public readonly exponentBits: number,
        public readonly mantissaBits: number,
        public readonly place: number
    ) {
        this.mantissaMax = BigNumber.from(2 ** mantissaBits - 1);
        this.exponentMax = 2 ** exponentBits - 1;
        this.exponentMask = BigNumber.from(this.exponentMax << mantissaBits);
        this.bytesLength = (mantissaBits + exponentBits) / 8;
    }
    public rand(): string {
        return randomHex(this.bytesLength);
    }

    public randNum(): number {
        return this.decode(this.rand());
    }

    public cast(input: number): number {
        if (input == 0) {
            return input;
        }

        const logMantissaMax = Math.log10(this.mantissaMax.toNumber());
        const logInput = Math.log10(input);
        const exponent = Math.floor(logMantissaMax - logInput);
        const mantissa = Math.floor(input * 10 ** exponent);

        return mantissa / 10 ** exponent;
    }

    public encode(input: number) {
        // Use Math.round here to prevent the case
        // > 32.3 * 10 ** 6
        // 32299999.999999996
        const integer = Math.round(input * 10 ** this.place);
        return this.encodeInt(integer);
    }
    public decode(input: BytesLike): number {
        const integer = this.decodeInt(input);
        const tens = BigNumber.from(10).pow(this.place);
        if (integer.gte(Number.MAX_SAFE_INTEGER.toString())) {
            return integer.div(tens).toNumber();
        } else {
            return integer.toNumber() / tens.toNumber();
        }
    }

    public encodeInt(input: BigNumberish): string {
        let exponent = 0;
        let mantissa = BigNumber.from(input.toString());
        for (let i = 0; i < this.exponentMax; i++) {
            if (!mantissa.isZero() && mantissa.mod(10).isZero()) {
                mantissa = mantissa.div(10);
                exponent += 1;
            } else {
                break;
            }
        }
        if (mantissa.gt(this.mantissaMax)) {
            throw new EncodingError(
                `Can not encode input ${input}, mantissa ${mantissa} should not be larger than ${this.mantissaMax}`
            );
        }
        return BigNumber.from(exponent)
            .shl(this.mantissaBits)
            .add(mantissa)
            .toHexString()
            .padStart(this.bytesLength);
    }
    public decodeInt(input: BytesLike): BigNumber {
        const mantissa = this.mantissaMax.and(input);
        const exponent = this.exponentMask.and(input).shr(this.mantissaBits);

        return mantissa.mul(BigNumber.from(10).pow(exponent));
    }
}
